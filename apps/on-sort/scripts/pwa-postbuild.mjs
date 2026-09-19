// Transforme l'export web Expo (dist/) en PWA installable :
// - injecte les meta (theme-color, apple-touch-icon, manifest, mode standalone)
//   dans index.html + l'enregistrement du service worker ;
// - écrit manifest.webmanifest et sw.js ;
// - copie les icônes PWA dans dist/icons/.
// Lancé après `expo export -p web`. L'app est servie à la racine du domaine
// (worker papa-parfait-web), donc tous les chemins sont absolus depuis « / ».

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');
const dist = join(racine, 'dist');
const assets = join(racine, 'assets');

const NOM = 'Papa Parfait';
const THEME = '#D95B43';
const FOND = '#FAF6EF';

// 1. Icônes.
mkdirSync(join(dist, 'icons'), { recursive: true });
for (const f of ['pwa-192.png', 'pwa-512.png', 'pwa-512-maskable.png', 'apple-touch-icon.png']) {
  copyFileSync(join(assets, f), join(dist, 'icons', f));
}

// 2. Manifest.
const manifest = {
  name: NOM,
  short_name: NOM,
  description: 'Les meilleures sorties pour tes enfants, autour de toi, météo comprise.',
  lang: 'fr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: FOND,
  theme_color: THEME,
  icons: [
    { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// 3. Service worker : app-shell en cache (network-first, fallback cache) —
//    suffisant pour l'installabilité et un chargement rapide en visites répétées.
const sw = `const CACHE = 'papa-parfait-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Jamais mettre en cache les appels aux workers de données (top, votes, tribu).
  if (/\\.workers\\.dev\\//.test(req.url)) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copie = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copie)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('/'))),
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);

// 4. Injection dans index.html.
const indexPath = join(dist, 'index.html');
let html = readFileSync(indexPath, 'utf8');

const tete = `
    <meta name="theme-color" content="${THEME}" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="${NOM}" />
    <meta name="description" content="Les meilleures sorties pour tes enfants, autour de toi, météo comprise." />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
`;
html = html.replace('</head>', `${tete}  </head>`);

const enregistrementSW = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
      }
    </script>
`;
html = html.replace('</body>', `${enregistrementSW}  </body>`);

writeFileSync(indexPath, html);

console.log('PWA post-build : manifest, sw.js, icônes et meta injectés.');
