// Worker bni-infomerciales : dépôt des photos d'infomerciales par lien perso,
// admin, et API du job hebdo qui met à jour le deck OneDrive.
//
// Clés KV :
//   membres          [{ slide_id, nom, metier, recherche, a_une_photo }] (écrit par le job)
//   jetons           { <jeton>: slide_id }                                (liens perso)
//   depot:<id>       { slide_id, recherche, a_photo, date }
//   photo:<id>       JPEG (déjà réduit par le téléphone)
//   ms               { refresh_token, client_id, drive_id, item_id }       (jamais servi aux membres)
//   dernier_run      { date, ok, message, mis_a_jour }

import PAGE_MEMBRE from './membre.html';
import PAGE_ADMIN from './admin.html';

const PHOTO_MAX = 5 * 1024 * 1024;
const RECHERCHE_MAX = 160;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const html = (corps) => new Response(corps, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
});
const erreur = (message, status = 400) => json({ erreur: message }, status);

const lire = async (env, cle, defaut) => (await env.KV.get(cle, 'json')) ?? defaut;

export function nouveauJeton() {
  const octets = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// WASSIM_AUTH_TOKEN (partagé avec les autres workers, utilisé par le job) ou
// BNI_ADMIN_TOKEN (propre à ce module, pour l'admin et connexion_microsoft.py).
function estAdmin(request, env) {
  const recu = request.headers.get('X-Wassim-Auth');
  return Boolean(recu) && [env.WASSIM_AUTH_TOKEN, env.BNI_ADMIN_TOKEN].some((t) => Boolean(t) && recu === t);
}

async function membreParJeton(env, jeton) {
  if (!jeton) return null;
  const jetons = await lire(env, 'jetons', {});
  const id = jetons[jeton];
  if (id === undefined) return null;
  const membres = await lire(env, 'membres', []);
  return membres.find((m) => m.slide_id === id) ?? null;
}

async function enregistrerDepot(env, slideId, modif) {
  const precedent = await lire(env, `depot:${slideId}`, { slide_id: slideId, recherche: '', a_photo: false });
  const depot = { ...precedent, ...modif, date: new Date().toISOString() };
  await env.KV.put(`depot:${slideId}`, JSON.stringify(depot));
  return depot;
}

// ---------- membres ----------

async function routesMembre(request, env, url) {
  const membre = await membreParJeton(env, url.searchParams.get('m'));
  if (!membre) return erreur('Lien invalide. Demande ton lien perso à Wassim.', 403);
  const id = membre.slide_id;

  if (url.pathname === '/api/moi' && request.method === 'GET') {
    const depot = await lire(env, `depot:${id}`, null);
    return json({ nom: membre.nom, metier: membre.metier, recherche: membre.recherche, depot });
  }
  if (url.pathname === '/api/photo' && request.method === 'GET') {
    const photo = await env.KV.get(`photo:${id}`, 'arrayBuffer');
    return photo ? new Response(photo, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } }) : erreur('Pas de photo.', 404);
  }
  if (url.pathname === '/api/photo' && request.method === 'PUT') {
    if (!(request.headers.get('Content-Type') || '').startsWith('image/jpeg')) return erreur('Photo attendue en JPEG.');
    const corps = await request.arrayBuffer();
    if (corps.byteLength === 0) return erreur('Photo vide.');
    if (corps.byteLength > PHOTO_MAX) return erreur('Photo trop lourde (5 Mo max).', 413);
    await env.KV.put(`photo:${id}`, corps);
    return json(await enregistrerDepot(env, id, { a_photo: true }));
  }
  if (url.pathname === '/api/depot' && request.method === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const recherche = String(corps.recherche ?? '').split(/\s+/).filter(Boolean).join(' ').slice(0, RECHERCHE_MAX);
    return json(await enregistrerDepot(env, id, { recherche }));
  }
  return erreur('Introuvable.', 404);
}

// ---------- admin + job (X-Wassim-Auth) ----------

async function etatAdmin(env, origine) {
  const [membres, jetons, ms, dernierRun] = await Promise.all([
    lire(env, 'membres', []), lire(env, 'jetons', {}), lire(env, 'ms', null), lire(env, 'dernier_run', null),
  ]);
  const jetonDe = Object.fromEntries(Object.entries(jetons).map(([j, id]) => [id, j]));
  const liste = await Promise.all(membres.map(async (m) => ({
    ...m,
    lien: jetonDe[m.slide_id] ? `${origine}/?m=${jetonDe[m.slide_id]}` : null,
    depot: await lire(env, `depot:${m.slide_id}`, null),
  })));
  return {
    membres: liste,
    microsoft_connecte: Boolean(ms?.refresh_token),
    bouton_dispo: Boolean(env.GH_DISPATCH_TOKEN),
    dernier_run: dernierRun,
  };
}

async function declencherJob(env) {
  if (!env.GH_DISPATCH_TOKEN) return erreur('Bouton non configuré : lance le workflow « BNI infomerciales » depuis GitHub.', 501);
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bni-infomerciales-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: env.GITHUB_REF }),
  });
  if (r.status !== 204) return erreur(`GitHub a refusé le lancement (${r.status}).`, 502);
  return json({ ok: true });
}

// Le job envoie la liste des membres lue dans le deck et les dépôts appliqués.
async function recevoirResultat(env, corps) {
  if (Array.isArray(corps.membres)) {
    const membres = corps.membres.map((m) => ({
      slide_id: Number(m.slide_id), nom: String(m.nom), metier: String(m.metier ?? ''),
      recherche: String(m.recherche ?? ''), a_une_photo: Boolean(m.a_une_photo),
    }));
    const jetons = await lire(env, 'jetons', {});
    const dejaLies = new Set(Object.values(jetons));
    for (const m of membres) if (!dejaLies.has(m.slide_id)) jetons[nouveauJeton()] = m.slide_id;
    await env.KV.put('membres', JSON.stringify(membres));
    await env.KV.put('jetons', JSON.stringify(jetons));
  }
  // un dépôt n'est effacé que s'il n'a pas été modifié pendant le job
  for (const { slide_id: id, date } of corps.appliques ?? []) {
    const depot = await lire(env, `depot:${id}`, null);
    if (depot && depot.date === date) {
      await env.KV.delete(`depot:${id}`);
      await env.KV.delete(`photo:${id}`);
    }
  }
  const run = { date: new Date().toISOString(), ok: Boolean(corps.ok), message: String(corps.message ?? ''), mis_a_jour: (corps.appliques ?? []).length };
  await env.KV.put('dernier_run', JSON.stringify(run));
  return json(run);
}

async function routesAdmin(request, env, url) {
  if (!estAdmin(request, env)) return erreur('Accès refusé.', 401);
  const p = url.pathname;
  const m = request.method;

  if (p === '/api/admin/etat' && m === 'GET') return json(await etatAdmin(env, url.origin));
  if (p === '/api/admin/appliquer' && m === 'POST') return declencherJob(env);

  const photo = p.match(/^\/api\/(?:admin|job)\/photo\/(\d+)$/);
  if (photo && m === 'GET') {
    const img = await env.KV.get(`photo:${photo[1]}`, 'arrayBuffer');
    return img ? new Response(img, { headers: { 'Content-Type': 'image/jpeg' } }) : erreur('Pas de photo.', 404);
  }

  if (p === '/api/job/entree' && m === 'GET') {
    const membres = await lire(env, 'membres', []);
    const ms = await lire(env, 'ms', null);
    const { keys } = await env.KV.list({ prefix: 'depot:' });
    const depots = (await Promise.all(keys.map((k) => lire(env, k.name, null)))).filter(Boolean);
    return json({ ms, depots, nb_membres: membres.length });
  }
  if (p === '/api/job/ms' && m === 'PUT') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const actuel = await lire(env, 'ms', {});
    const suivant = { ...actuel, ...corps };
    if (!suivant.refresh_token || !suivant.client_id) return erreur('refresh_token et client_id requis.');
    await env.KV.put('ms', JSON.stringify(suivant));
    return json({ ok: true });
  }
  if (p === '/api/job/resultat' && m === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    return recevoirResultat(env, corps);
  }
  return erreur('Introuvable.', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/' && request.method === 'GET') return html(PAGE_MEMBRE);
      if (p === '/admin' && request.method === 'GET') return html(PAGE_ADMIN);
      if (p === '/health') return json({ ok: true });
      if (p.startsWith('/api/admin/') || p.startsWith('/api/job/')) return await routesAdmin(request, env, url);
      if (p.startsWith('/api/')) return await routesMembre(request, env, url);
      return erreur('Introuvable.', 404);
    } catch (e) {
      console.error('erreur', e && e.message);
      return erreur('Erreur interne.', 500);
    }
  },
};
