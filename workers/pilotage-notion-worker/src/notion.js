/* Accès Notion partagé (lecture + écriture whitelistée) pour la base « Pilotage 26/27 ».
   Le token reste côté serveur : ce module n'est jamais exposé tel quel au navigateur. */

const TITLE    = ["Client"];
const SELECTS  = ["Type", "Statut", "Étape", "Source"];
const NUMBERS  = ["Montant HT", "Durée mois", "Encaissé HT", "Nombre"];
const DATES    = ["Début", "Relance", "RDV prévu"];
const TEXTS    = ["Contact", "Offre", "Notes", "Encaissements", "Echeances"];
const CHECKBOX = ["RDV fait"];

/* Construit des propriétés Notion à partir de clés connues de CETTE base.
   Les clés inconnues sont ignorées : le Worker ne peut pas servir de proxy Notion ouvert. */
export function buildProps(f) {
  const p = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    if (TITLE.includes(k))         p[k] = { title: v ? [{ text: { content: String(v) } }] : [] };
    else if (SELECTS.includes(k))  p[k] = v ? { select: { name: String(v) } } : { select: null };
    else if (NUMBERS.includes(k))  p[k] = { number: (v === null || v === "") ? null : Number(v) };
    else if (DATES.includes(k))    p[k] = { date: v ? { start: String(v) } : null };
    else if (TEXTS.includes(k))    p[k] = { rich_text: v ? [{ text: { content: String(v) } }] : [] };
    else if (CHECKBOX.includes(k)) p[k] = { checkbox: Boolean(v) };
  }
  return p;
}

export function notionHeaders(env) {
  return {
    "Authorization": `Bearer ${env.NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

/* Erreur portant le statut HTTP Notion, pour que l'appelant réponde proprement. */
export class NotionError extends Error {
  constructor(status, detail) {
    super(`notion-${status}`);
    this.status = status;
    this.detail = detail;
  }
}

/* Toutes les lignes de la base (pagination bornée à 12 pages = 1200 lignes). */
export async function queryAll(env) {
  const headers = notionHeaders(env);
  let results = [], cursor, pages = 0;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await fetch(`https://api.notion.com/v1/databases/${env.PILOT_DB_ID}/query`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    if (!r.ok) throw new NotionError(r.status, await r.text());
    const j = await r.json();
    results = results.concat(j.results || []);
    cursor = j.has_more ? j.next_cursor : undefined;
    pages++;
  } while (cursor && pages < 12);
  return results;
}

export async function patchPage(env, id, properties) {
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: "PATCH", headers: notionHeaders(env), body: JSON.stringify({ properties }),
  });
  if (!r.ok) throw new NotionError(r.status, await r.text());
  return r.json();
}

export async function archivePage(env, id) {
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: "PATCH", headers: notionHeaders(env), body: JSON.stringify({ archived: true }),
  });
  if (!r.ok) throw new NotionError(r.status, await r.text());
  return r.json();
}

export async function createPage(env, properties) {
  const r = await fetch(`https://api.notion.com/v1/pages`, {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify({ parent: { database_id: env.PILOT_DB_ID }, properties }),
  });
  if (!r.ok) throw new NotionError(r.status, await r.text());
  return r.json();
}

export async function getPage(env, id) {
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, { headers: notionHeaders(env) });
  if (!r.ok) throw new NotionError(r.status, await r.text());
  return r.json();
}
