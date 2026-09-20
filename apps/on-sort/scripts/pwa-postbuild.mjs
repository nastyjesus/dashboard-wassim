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
// Charte « Cockpit clair » (docs/charte-graphique.md) : la barre du navigateur
// prend l'encre du bandeau instrument, l'écran de démarrage le sable du fond.
// L'ambre reste réservé au GO dans l'app — il ne décore pas le chrome.
const THEME = '#1B1815';
const FOND = '#ECE6DA';

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

// 5. Politique de confidentialité en page statique.
//    Google Play exige une URL publique ; on la génère depuis le Markdown pour
//    qu'il n'existe qu'une seule version du texte (docs/politique-confidentialite.md).
//    L'app étant une SPA, la page vit dans son propre dossier pour ne pas être
//    avalée par le routage « tout vers index.html ».
//    Écrite à deux endroits : `confidentialite.html` répond à l'URL sans
//    barre oblique (celle qu'on donne à Google Play), `confidentialite/index.html`
//    à celle avec. Sans les deux, le routage SPA renvoie l'app à la place.
const md = readFileSync(join(racine, 'docs', 'politique-confidentialite.md'), 'utf8');
const pageHtml = pageConfidentialite(md);
mkdirSync(join(dist, 'confidentialite'), { recursive: true });
writeFileSync(join(dist, 'confidentialite', 'index.html'), pageHtml);
writeFileSync(join(dist, 'confidentialite.html'), pageHtml);

console.log('PWA post-build : manifest, sw.js, icônes, meta et /confidentialite écrits.');

/** Échappe le HTML : le Markdown est à nous, mais on ne prend pas le risque. */
function echapper(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Gras, italique, liens nus, e-mails — le strict nécessaire de ce document. */
function enLigne(s) {
  return echapper(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\b([\w.+-]+@[\w-]+\.[\w.]+)\b/g, '<a href="mailto:$1">$1</a>')
    .replace(/\b(www\.[\w.-]+)\b/g, '<a href="https://$1" rel="noopener">$1</a>');
}

/** Markdown minimal → HTML, charte « Cockpit clair ». */
function pageConfidentialite(markdown) {
  const corps = [];
  let paragraphe = [];
  let liste = [];
  const viderParagraphe = () => {
    if (paragraphe.length) corps.push(`<p>${enLigne(paragraphe.join(' '))}</p>`);
    paragraphe = [];
  };
  const viderListe = () => {
    if (liste.length) corps.push(`<ul>${liste.map((li) => `<li>${enLigne(li)}</li>`).join('')}</ul>`);
    liste = [];
  };
  for (const brute of markdown.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne) { viderParagraphe(); viderListe(); continue; }
    if (ligne.startsWith('## ')) {
      viderParagraphe(); viderListe();
      corps.push(`<h2>${enLigne(ligne.slice(3))}</h2>`);
    } else if (ligne.startsWith('# ')) {
      viderParagraphe(); viderListe();
      corps.push(`<h1>${enLigne(ligne.slice(2))}</h1>`);
    } else if (ligne.startsWith('- ')) {
      viderParagraphe();
      liste.push(ligne.slice(2));
    } else if (liste.length && !paragraphe.length) {
      // Suite d'une puce repliée sur plusieurs lignes : elle appartient au
      // dernier point, pas à un nouveau paragraphe.
      liste[liste.length - 1] += ` ${ligne}`;
    } else {
      viderListe();
      paragraphe.push(ligne);
    }
  }
  viderParagraphe();
  viderListe();

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Politique de confidentialité — ${NOM}</title>
<meta name="theme-color" content="${THEME}" />
<meta name="robots" content="index, follow" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@700;800&family=IBM+Plex+Sans:wght@400;600&display=swap" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: ${FOND}; color: #1B1815;
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    font-size: 16px; line-height: 1.6;
  }
  .page { max-width: 720px; margin: 0 auto; padding-inline: 20px; padding-block: 0 64px; }
  header {
    background: #1B1815; color: #F4EFE6;
    margin-inline: -20px; padding: 22px 20px;
  }
  header .marque {
    font-family: "Saira Condensed", "Arial Narrow", sans-serif; font-weight: 800;
    font-size: 30px; line-height: 1; text-transform: uppercase; letter-spacing: -0.3px;
  }
  header .sous {
    font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase;
    color: #FF8A00; margin-top: 4px;
  }
  h1 {
    font-family: "Saira Condensed", "Arial Narrow", sans-serif; font-weight: 800;
    font-size: 34px; line-height: 1.05; margin: 28px 0 4px; text-wrap: balance;
  }
  h2 {
    font-family: "Saira Condensed", "Arial Narrow", sans-serif; font-weight: 700;
    font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase;
    margin: 32px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #1B1815;
  }
  p, li { color: #5C554B; }
  p em { color: #8B8375; font-style: normal; font-size: 14px; }
  strong { color: #1B1815; font-weight: 600; }
  ul { padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
  a { color: #A85400; }
  a:focus-visible { outline: 2px solid #FF8A00; outline-offset: 2px; }
  footer {
    margin-top: 40px; padding-top: 14px; border-top: 1px solid #D7CFC0;
    font-size: 13px; color: #8B8375;
  }
</style>
</head>
<body>
<header><div class="marque">${NOM}</div><div class="sous">Le QG des papas</div></header>
<main class="page">
${corps.join('\n')}
<footer><a href="/">Retour à l'application</a></footer>
</main>
</body>
</html>
`;
}
