/* Branche le bot Telegram sur le Worker.
   Usage :
     TELEGRAM_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
     WORKER_URL=https://pilotage-notion-worker.loumiwassim.workers.dev \
     node scripts/setup-telegram.mjs

   Sans argument, affiche l'état actuel du webhook.
   Avec « --reset », supprime le webhook. */

const { TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET, WORKER_URL } = process.env;
if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_TOKEN manquant.");
  process.exit(1);
}

const api = (m, body) => fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${m}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body || {}),
}).then((r) => r.json());

if (process.argv.includes("--reset")) {
  console.log(await api("deleteWebhook", { drop_pending_updates: true }));
  process.exit(0);
}

if (!WORKER_URL || !TELEGRAM_WEBHOOK_SECRET) {
  console.log("État du webhook :");
  console.log(JSON.stringify(await api("getWebhookInfo"), null, 2));
  console.log("\nPour (re)brancher : fournir WORKER_URL et TELEGRAM_WEBHOOK_SECRET.");
  process.exit(0);
}

const res = await api("setWebhook", {
  url: `${WORKER_URL.replace(/\/+$/, "")}/tg`,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
console.log(res);

/* Les commandes proposées dans le menu du bot. */
console.log(await api("setMyCommands", {
  commands: [
    { command: "relances", description: "Les relances à faire maintenant" },
    { command: "aide", description: "Ce que sait faire ce bot" },
  ],
}));
