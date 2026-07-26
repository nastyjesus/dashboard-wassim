/* Worker pilotage-notion-worker — lecture + écriture Notion (base « Pilotage 26/27 »).
   - GET            : lecture ouverte (renvoie {results:[...]}), rétrocompatible pilotage-live.html.
   - POST/PATCH/DELETE : écriture, protégée par le header X-Pilot-Key (secret PILOT_WRITE_KEY).
   Le token Notion reste secret côté serveur. Écriture whitelistée : le Worker ne construit que
   des propriétés connues de CETTE base — il ne peut pas servir de proxy Notion ouvert. */

const TITLE    = ["Client"];
const SELECTS  = ["Type", "Statut", "Étape", "Source"];
const NUMBERS  = ["Montant HT", "Durée mois", "Encaissé HT", "Nombre"];
const DATES    = ["Début", "Relance", "RDV prévu"];
const TEXTS    = ["Contact", "Offre", "Notes", "Encaissements"];
const CHECKBOX = ["RDV fait"];

function buildProps(f) {
  const p = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    if (TITLE.includes(k))         p[k] = { title: v ? [{ text: { content: String(v) } }] : [] };
    else if (SELECTS.includes(k))  p[k] = v ? { select: { name: String(v) } } : { select: null };
    else if (NUMBERS.includes(k))  p[k] = { number: (v === null || v === "") ? null : Number(v) };
    else if (DATES.includes(k))    p[k] = { date: v ? { start: String(v) } : null };
    else if (TEXTS.includes(k))    p[k] = { rich_text: v ? [{ text: { content: String(v) } }] : [] };
    else if (CHECKBOX.includes(k)) p[k] = { checkbox: Boolean(v) };
    /* clés inconnues ignorées : pas de proxy Notion ouvert */
  }
  return p;
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Pilot-Key",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

    const DB = env.PILOT_DB_ID;
    if (!DB) return json({ error: "no-db-configured" }, 500);

    const NV = {
      "Authorization": `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };

    /* ---------- LECTURE (ouverte) ---------- */
    if (request.method === "GET") {
      try {
        let results = [], cursor, pages = 0;
        do {
          const body = { page_size: 100 };
          if (cursor) body.start_cursor = cursor;
          const r = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
            method: "POST", headers: NV, body: JSON.stringify(body),
          });
          if (!r.ok) { const detail = await r.text(); return json({ error: `notion-${r.status}`, detail }, 502); }
          const j = await r.json();
          results = results.concat(j.results || []);
          cursor = j.has_more ? j.next_cursor : undefined;
          pages++;
        } while (cursor && pages < 12);
        return json({ results });
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    /* ---------- ÉCRITURE (protégée par X-Pilot-Key) ---------- */
    if (["POST", "PATCH", "DELETE"].includes(request.method)) {
      const key = request.headers.get("X-Pilot-Key");
      if (!env.PILOT_WRITE_KEY || key !== env.PILOT_WRITE_KEY) return json({ error: "unauthorized" }, 401);

      let payload;
      try { payload = await request.json(); } catch (e) { return json({ error: "bad-json" }, 400); }

      try {
        /* archiver (suppression douce) */
        if (request.method === "DELETE" || payload.archived) {
          if (!payload.id) return json({ error: "missing-id" }, 400);
          const r = await fetch(`https://api.notion.com/v1/pages/${payload.id}`, {
            method: "PATCH", headers: NV, body: JSON.stringify({ archived: true }),
          });
          if (!r.ok) { const detail = await r.text(); return json({ error: `notion-${r.status}`, detail }, 502); }
          return json({ ok: true, id: payload.id });
        }

        const props = buildProps(payload.fields || {});

        /* mise à jour d'une page existante */
        if (payload.id) {
          const r = await fetch(`https://api.notion.com/v1/pages/${payload.id}`, {
            method: "PATCH", headers: NV, body: JSON.stringify({ properties: props }),
          });
          if (!r.ok) { const detail = await r.text(); return json({ error: `notion-${r.status}`, detail }, 502); }
          const j = await r.json();
          return json({ ok: true, id: j.id });
        }

        /* création d'une nouvelle page */
        const r = await fetch(`https://api.notion.com/v1/pages`, {
          method: "POST", headers: NV, body: JSON.stringify({ parent: { database_id: DB }, properties: props }),
        });
        if (!r.ok) { const detail = await r.text(); return json({ error: `notion-${r.status}`, detail }, 502); }
        const j = await r.json();
        return json({ ok: true, id: j.id });
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    return json({ error: "method-not-allowed" }, 405);
  },
};
