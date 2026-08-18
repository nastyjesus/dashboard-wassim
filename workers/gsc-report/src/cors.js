// Gestion CORS centralisée. Important : Access-Control-Allow-Headers doit
// inclure x-requested-with (apprentissage du worker précédent notion-proxy).

/**
 * Construit les headers CORS pour la requête courante.
 * @param {Request} request
 * @param {{ ALLOWED_ORIGINS?: string }} env
 * @returns {Record<string,string>}
 */
export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  // Si l'origine appelante est dans la liste, on l'écho. Sinon on renvoie la première
  // origine autorisée (sécurise par défaut).
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-requested-with, X-Wassim-Auth, Notion-Version',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Réponse JSON avec CORS appliqué.
 */
export function jsonResponse(body, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

/**
 * Réponse pour les requêtes OPTIONS (préflight).
 */
export function preflightResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}
