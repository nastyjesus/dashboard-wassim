/* Service Worker du cockpit — uniquement les notifications de relance.
   Pas de cache hors-ligne : le cockpit doit toujours lire Notion frais.

   Le push arrive SANS charge utile (aucune donnée client ne transite par Apple ou Google) :
   on rappelle le Worker pour composer le texte au moment de l'affichage. */

const WORKER_URL = "https://pilotage-notion-worker.loumiwassim.workers.dev";
const COCKPIT = "cockpit.html";
const TAG = "relances";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const eur = (n) => (n ? Math.round(n).toLocaleString("fr-FR") + " €" : "");

async function texteRelances() {
  try {
    const r = await fetch(`${WORKER_URL}/relances`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const n = d.compte.dues;
    if (!n) return { titre: "Cockpit", corps: "Rien à relancer aujourd'hui." };
    const noms = d.dues.slice(0, 3).map((p) => p.nom).join(", ");
    const reste = n > 3 ? ` +${n - 3}` : "";
    return {
      titre: `${n} relance${n > 1 ? "s" : ""} aujourd'hui`,
      corps: `${noms}${reste} · pipeline pondéré ${eur(d.pipePondere)}`,
    };
  } catch (e) {
    /* Worker injoignable : mieux vaut une notification vague qu'aucune notification. */
    return { titre: "Relances du jour", corps: "Ouvre le cockpit pour voir le pipeline." };
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const { titre, corps } = await texteRelances();
    await self.registration.showNotification(titre, {
      body: corps,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: TAG,               /* une seule notification de relance à la fois */
      renotify: true,
      data: { url: COCKPIT },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const cible = new URL(event.notification.data && event.notification.data.url || COCKPIT, self.registration.scope).href;
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of fenetres) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) {
        await c.navigate(cible).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(cible);
  })());
});
