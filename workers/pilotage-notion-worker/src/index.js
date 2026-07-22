export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const DB = env.PILOT_DB_ID;
    if (!DB) {
      return new Response(JSON.stringify({ error: "no-db-configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    try {
      let results = [], cursor = undefined, pages = 0;
      do {
        const body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const r = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.NOTION_TOKEN}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const detail = await r.text();
          return new Response(JSON.stringify({ error: `notion-${r.status}`, detail }), {
            status: 502, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const j = await r.json();
        results = results.concat(j.results || []);
        cursor = j.has_more ? j.next_cursor : undefined;
        pages++;
      } while (cursor && pages < 12);

      return new Response(JSON.stringify({ results }), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  },
};
