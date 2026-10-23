// Worker copilote-papa — point d'entrée.
// Le copilote de Papa Parfait : quatre briques (SOS crise, activité maison,
// histoire du soir, plan du week-end) servies sur WhatsApp et dans la PWA.
// Conception : docs/superpowers/specs/2026-10-23-copilote-papa-design.md
//
// Lot 1 (socle) : santé seulement. Les routes arrivent avec leurs lots :
//   POST /message, /retour, /efface   — PWA (lot 4)
//   GET|POST /whatsapp                — webhook Meta (lot 5)

import { jsonResponse, preflightResponse } from './cors.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const rep = (body, status = 200) => jsonResponse(body, status, request, env);

    if (path === '/health' || path === '/') {
      return rep({
        ok: true,
        worker: 'copilote-papa',
        supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY),
        ts: new Date().toISOString(),
      });
    }

    return rep({ error: 'introuvable' }, 404);
  },
};
