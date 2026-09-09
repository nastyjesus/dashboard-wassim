/* Canal Telegram : digest du matin + boutons qui écrivent dans Notion.
   Le message n'est pas qu'une alerte, c'est une télécommande du pipeline. */

import { patchPage, getPage } from "./notion.js";
import {
  analyser, toProspect, nomAffiche, isoPlus, todayParis, joursEntre,
  ETAPE_NAME, ORDRE,
} from "./relances.js";

/* Au-delà, le digest devient un mur de texte : on résume le reste sur une ligne. */
const MAX_CARTES = 8;
/* Repoussoirs par défaut, en jours. */
const DELAI_RELANCE = 7;
const DELAI_SNOOZE = 3;

const api = (env, method) => `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`;

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const eur = (n) => (n ? Math.round(n).toLocaleString("fr-FR") + " €" : "—");
const court = (id) => String(id).replace(/-/g, "");        /* callback_data ≤ 64 octets */
const long = (id32) => (id32.length === 32
  ? `${id32.slice(0, 8)}-${id32.slice(8, 12)}-${id32.slice(12, 16)}-${id32.slice(16, 20)}-${id32.slice(20)}`
  : id32);

async function call(env, method, body) {
  const r = await fetch(api(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`telegram-${method}: ${j.description || r.status}`);
  return j.result;
}

export const envoyer = (env, text, extra = {}) =>
  call(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, parse_mode: "HTML", disable_web_page_preview: true, text, ...extra });

/* Date affichée « lun. 9 sept. » plutôt que 2026-09-09. */
const jourFr = (iso) => new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short",
}).format(new Date(`${iso}T12:00:00Z`));

function clavier(p) {
  const id = court(p.id);
  return {
    inline_keyboard: [[
      { text: "✅ Relancé", callback_data: `d:${id}` },
      { text: `＋${DELAI_SNOOZE}j`, callback_data: `s:${id}` },
      { text: "→ Avancer", callback_data: `a:${id}` },
      { text: "✕ Perdu", callback_data: `p:${id}` },
    ]],
  };
}

function carte(p, today) {
  const retard = p.relance ? joursEntre(p.relance, today) : 0;
  const marque = retard > 0 ? ` · <b>${retard} j de retard</b>` : "";
  const qui = p.contact && p.societe ? `\n${esc(p.contact)}` : "";
  const offre = p.offre ? ` · ${esc(p.offre)}` : "";
  return `<b>${esc(nomAffiche(p))}</b>${qui}\n${ETAPE_NAME[p.etape]} · ${eur(p.montant)}${offre}${marque}`;
}

/* Digest du matin, à partir d'une analyse déjà faite. Renvoie le nombre de relances poussées. */
export async function envoyerDigest(env, analyse, cockpitUrl) {
  const { dues, sansRelance, dormants, pipePondere, aVenir, today } = analyse;

  const titre = dues.length
    ? `🎯 <b>${dues.length} relance${dues.length > 1 ? "s" : ""}</b> — ${jourFr(today)}`
    : `🎯 <b>Pipeline dormant</b> — ${jourFr(today)}`;
  const lignes = [titre, `Pipeline pondéré ${eur(pipePondere)}`];
  if (aVenir.length) lignes.push(`${aVenir.length} relance${aVenir.length > 1 ? "s" : ""} plus tard cette période`);
  if (dormants.length) lignes.push(`⚠️ ${dormants.length} prospect${dormants.length > 1 ? "s" : ""} sans relance et sans mouvement`);
  if (sansRelance.length) lignes.push(`📌 ${sansRelance.length} sans date de relance`);

  await envoyer(env, lignes.join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: "Ouvrir le cockpit", url: cockpitUrl }]] },
  });

  const cartes = dues.slice(0, MAX_CARTES);
  for (const p of cartes) {
    await envoyer(env, carte(p, today), { reply_markup: clavier(p) });
  }
  if (dues.length > cartes.length) {
    await envoyer(env, `… et ${dues.length - cartes.length} autre${dues.length - cartes.length > 1 ? "s" : ""} relance${dues.length - cartes.length > 1 ? "s" : ""} dans le cockpit.`);
  }
  return dues.length;
}

/* Applique l'action d'un bouton et renvoie le texte de confirmation. */
async function appliquer(env, action, pageId) {
  const page = await getPage(env, pageId);
  const p = toProspect(page);
  if (!p) return { texte: "Ce prospect n'est plus dans le pipeline.", toast: "Introuvable" };
  const today = todayParis();
  const nom = esc(nomAffiche(p));

  if (action === "d") {
    const next = isoPlus(today, DELAI_RELANCE);
    await patchPage(env, pageId, { "Relance": { date: { start: next } } });
    return { texte: `✅ <b>${nom}</b> — relancé. Prochaine relance le ${jourFr(next)}.`, toast: "Relancé" };
  }
  if (action === "s") {
    const base = p.relance && p.relance > today ? p.relance : today;
    const next = isoPlus(base, DELAI_SNOOZE);
    await patchPage(env, pageId, { "Relance": { date: { start: next } } });
    return { texte: `⏳ <b>${nom}</b> — repoussé au ${jourFr(next)}.`, toast: `+${DELAI_SNOOZE} jours` };
  }
  if (action === "a") {
    const i = ORDRE.indexOf(p.etape);
    const suivante = ORDRE[Math.min(i + 1, ORDRE.length - 1)];
    const props = { "Étape": { select: { name: ETAPE_NAME[suivante] } } };
    /* Signé sort du pipeline : plus de relance à porter. Sinon on repose un rendez-vous. */
    if (suivante === "signe") props["Relance"] = { date: null };
    else props["Relance"] = { date: { start: isoPlus(today, DELAI_RELANCE) } };
    await patchPage(env, pageId, props);
    return {
      texte: `→ <b>${nom}</b> — ${ETAPE_NAME[suivante]}.` + (suivante === "signe" ? " 🎉" : ` Relance le ${jourFr(isoPlus(today, DELAI_RELANCE))}.`),
      toast: ETAPE_NAME[suivante],
    };
  }
  if (action === "p") {
    await patchPage(env, pageId, { "Étape": { select: { name: "Perdu" } }, "Relance": { date: null } });
    return { texte: `✕ <b>${nom}</b> — perdu.`, toast: "Perdu" };
  }
  return { texte: "Action inconnue.", toast: "?" };
}

const AIDE = [
  "Je t'envoie tes relances chaque matin, avec les boutons pour les traiter d'ici.",
  "",
  "<b>/relances</b> — l'état du pipeline maintenant",
  "<b>/aide</b> — ce message",
].join("\n");

/* Un update Telegram (webhook). Le contrôle d'origine est fait par l'appelant. */
export async function traiterUpdate(env, update, rows) {
  const cb = update.callback_query;
  if (cb) {
    const [action, id32] = String(cb.data || "").split(":");
    let res;
    try {
      res = await appliquer(env, action, long(id32));
    } catch (e) {
      res = { texte: `⚠️ Notion a refusé : ${esc(e.message)}`, toast: "Échec" };
    }
    await call(env, "answerCallbackQuery", { callback_query_id: cb.id, text: res.toast });
    await call(env, "editMessageText", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      parse_mode: "HTML",
      text: res.texte,
    });
    return;
  }

  const msg = update.message;
  if (!msg || !msg.text) return;
  const texte = msg.text.trim();

  if (/^\/(relances|start)\b/i.test(texte)) {
    const { dues, sansRelance, dormants, aVenir, pipePondere, today } = analyser(rows);
    if (!dues.length) {
      await envoyer(env, [
        `Rien à relancer aujourd'hui (${jourFr(today)}).`,
        `Pipeline pondéré ${eur(pipePondere)} · ${aVenir.length} relance${aVenir.length > 1 ? "s" : ""} à venir`,
        dormants.length ? `⚠️ ${dormants.length} prospect${dormants.length > 1 ? "s" : ""} dormant${dormants.length > 1 ? "s" : ""}` : "",
        sansRelance.length ? `📌 ${sansRelance.length} sans date de relance` : "",
      ].filter(Boolean).join("\n"));
      return;
    }
    await envoyer(env, `🎯 <b>${dues.length} relance${dues.length > 1 ? "s" : ""}</b> · pipeline pondéré ${eur(pipePondere)}`);
    for (const p of dues.slice(0, MAX_CARTES)) await envoyer(env, carte(p, today), { reply_markup: clavier(p) });
    return;
  }

  await envoyer(env, AIDE);
}
