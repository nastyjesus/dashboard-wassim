/* Worker pilotage-notion-worker — base Notion « Pilotage 26/27 ».

   Lecture / écriture (inchangé, rétrocompatible cockpit.html et pilotage-live.html) :
     GET    /                  lecture ouverte -> {results:[...]}
     POST   /                  création      | protégés par X-Pilot-Key
     PATCH  /                  mise à jour   |
     DELETE /                  archivage     |

   Relances de prospection :
     GET    /relances          état du pipeline (mêmes données que GET /, résumées)
     POST   /tg                webhook Telegram (X-Telegram-Bot-Api-Secret-Token + chat autorisé)
     POST   /push/subscribe    enregistre un appareil pour le push web
     DELETE /push/subscribe    le retire
     POST   /digest            déclenche le digest à la main (X-Pilot-Key) — pour tester

   Cron : le digest part une fois par jour ouvré, à l'heure de Paris.
   Le token Notion reste secret côté serveur. Écriture whitelistée : le Worker ne construit que
   des propriétés connues de CETTE base — il ne peut pas servir de proxy Notion ouvert. */

import { buildProps, queryAll, patchPage, archivePage, createPage, NotionError } from "./notion.js";
import { analyser, todayParis, heureParis, nomAffiche, ETAPE_NAME } from "./relances.js";
import { envoyerDigest, traiterUpdate } from "./telegram.js";
import { abonner, desabonner, pousserATous } from "./push.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Pilot-Key",
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const erreurNotion = (e) => (e instanceof NotionError
  ? json({ error: e.message, detail: e.detail }, 502)
  : json({ error: String(e) }, 500));

const autorise = (request, env) =>
  Boolean(env.PILOT_WRITE_KEY) && request.headers.get("X-Pilot-Key") === env.PILOT_WRITE_KEY;

/* Envoie le digest sur les canaux configurés. Les deux sont indépendants :
   le push doit partir même si Telegram n'est pas encore branché, et l'inverse. */
async function digest(env) {
  const a = analyser(await queryAll(env));
  /* Rien de dû et rien qui dort : pas de notification vide. */
  if (a.dues.length === 0 && a.dormants.length === 0) {
    return { relances: 0, telegram: false, push: { envoyes: 0, purges: 0 } };
  }
  const cockpit = env.COCKPIT_URL || "https://nastyjesus.github.io/dashboard-wassim/cockpit.html";
  const telegram = Boolean(env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT_ID);
  if (telegram) await envoyerDigest(env, a, cockpit);
  const push = await pousserATous(env);
  return { relances: a.dues.length, telegram, push };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (!env.PILOT_DB_ID) return json({ error: "no-db-configured" }, 500);

    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, "") || "/";

    /* ---------- webhook Telegram ---------- */
    if (route === "/tg" && request.method === "POST") {
      /* Secret partagé posé au moment du setWebhook : sans lui, on ne lit même pas le corps. */
      if (!env.TELEGRAM_WEBHOOK_SECRET
        || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      let update;
      try { update = await request.json(); } catch (e) { return json({ error: "bad-json" }, 400); }

      /* Deuxième verrou : seul le chat configuré peut piloter la base. */
      const chatId = String(
        (update.callback_query && update.callback_query.message && update.callback_query.message.chat.id)
        ?? (update.message && update.message.chat && update.message.chat.id)
        ?? ""
      );
      if (chatId !== String(env.TELEGRAM_CHAT_ID)) return json({ ok: true, ignore: "chat" });

      try {
        /* Les boutons ne lisent que la page ciblée : pas besoin de toute la base. */
        const rows = update.callback_query ? [] : await queryAll(env);
        await traiterUpdate(env, update, rows);
        return json({ ok: true });
      } catch (e) { return erreurNotion(e); }
    }

    /* ---------- abonnement push ---------- */
    if (route === "/push/subscribe") {
      if (!env.PILOT_KV) return json({ error: "no-kv" }, 500);
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad-json" }, 400); }
      const endpoint = body && body.endpoint;
      if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) return json({ error: "bad-endpoint" }, 400);
      if (request.method === "POST")   { await abonner(env, endpoint);    return json({ ok: true }); }
      if (request.method === "DELETE") { await desabonner(env, endpoint); return json({ ok: true }); }
      return json({ error: "method-not-allowed" }, 405);
    }

    /* ---------- état des relances (lu par le Service Worker et le cockpit) ---------- */
    if (route === "/relances" && request.method === "GET") {
      try {
        const a = analyser(await queryAll(env));
        return json({
          today: a.today,
          pipePondere: Math.round(a.pipePondere),
          compte: { dues: a.dues.length, aVenir: a.aVenir.length, sansRelance: a.sansRelance.length, dormants: a.dormants.length },
          dues: a.dues.map((p) => ({ id: p.id, nom: nomAffiche(p), etape: ETAPE_NAME[p.etape], montant: p.montant, relance: p.relance })),
        });
      } catch (e) { return erreurNotion(e); }
    }

    /* ---------- digest manuel (test) ---------- */
    if (route === "/digest" && request.method === "POST") {
      if (!autorise(request, env)) return json({ error: "unauthorized" }, 401);
      try { return json({ ok: true, ...(await digest(env)) }); } catch (e) { return erreurNotion(e); }
    }

    /* ---------- LECTURE (ouverte) ---------- */
    if (request.method === "GET" && route === "/") {
      try { return json({ results: await queryAll(env) }); } catch (e) { return erreurNotion(e); }
    }

    /* ---------- ÉCRITURE (protégée par X-Pilot-Key) ---------- */
    if (["POST", "PATCH", "DELETE"].includes(request.method) && route === "/") {
      if (!autorise(request, env)) return json({ error: "unauthorized" }, 401);

      let payload;
      try { payload = await request.json(); } catch (e) { return json({ error: "bad-json" }, 400); }

      try {
        if (request.method === "DELETE" || payload.archived) {
          if (!payload.id) return json({ error: "missing-id" }, 400);
          await archivePage(env, payload.id);
          return json({ ok: true, id: payload.id });
        }
        const props = buildProps(payload.fields || {});
        const j = payload.id ? await patchPage(env, payload.id, props) : await createPage(env, props);
        return json({ ok: true, id: j.id });
      } catch (e) { return erreurNotion(e); }
    }

    return json({ error: "not-found" }, 404);
  },

  /* Cron : plusieurs passages UTC, un seul envoi — celui qui tombe sur l'heure de Paris. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const heureCible = Number(env.DIGEST_HEURE || 8);
      if (heureParis(new Date(event.scheduledTime)) !== heureCible) return;

      /* Un digest par jour, même si deux crons tombent dans la même heure de Paris. */
      const marque = `digest:${todayParis(new Date(event.scheduledTime))}`;
      if (env.PILOT_KV && await env.PILOT_KV.get(marque)) return;
      if (env.PILOT_KV) await env.PILOT_KV.put(marque, "1", { expirationTtl: 172800 });

      try {
        await digest(env);
      } catch (e) {
        /* Le marqueur reste posé : on ne repart pas en boucle sur une panne Notion. */
        console.error("digest", String(e));
      }
    })());
  },
};
