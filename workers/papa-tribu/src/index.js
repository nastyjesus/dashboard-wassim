// Worker papa-tribu — point d'entrée.
// Backend communautaire de Papa Parfait. Identité légère : un pseudo, un
// jeton opaque généré côté serveur et gardé sur le téléphone — pas d'e-mail,
// pas de mot de passe, rien à fuiter.
//
// Endpoints publics :
//   GET  /health
//   GET  /fil?dept=&avant=            — fil (auth facultative : ajoute mon_pouce)
//   GET  /posts/:id/commentaires
// Endpoints authentifiés (Authorization: Bearer <jeton>) :
//   POST /inscription {pseudo, ville, dept}   — public, crée l'identité
//   POST /posts {type, texte}
//   POST /posts/:id/reaction                  — toggle du pouce
//   POST /posts/:id/commentaires {texte}
//   POST /signalements {cibleType, cibleId, raison}
// Admin (header X-Wassim-Auth) :
//   GET  /admin/signalements
//   POST /admin/masquer {cibleType, cibleId}
//   POST /admin/bannir {papaId}

import { jsonResponse, preflightResponse } from './cors.js';
import * as depot from './depot.js';
import {
  nettoyer, validerPseudo, validerTypePost, validerTextePost, validerCommentaire,
} from './valider.js';

const FONDATEURS = 100;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const rep = (body, status = 200) => jsonResponse(body, status, request, env);

    if (path === '/health' || path === '/') {
      return rep({ ok: true, worker: 'papa-tribu', db: !!env.DB, ts: new Date().toISOString() });
    }
    if (!env.DB) return rep({ error: 'db_not_bound' }, 503);

    try {
      return await router(request, env, url, path, rep);
    } catch (e) {
      return rep({ error: 'internal', message: String(e.message || e) }, 500);
    }
  },
};

async function router(request, env, url, path, rep) {
  const post = request.method === 'POST';

  if (path === '/inscription' && post) {
    const corps = await corpsJson(request);
    const pseudo = nettoyer(corps.pseudo);
    const invalide = validerPseudo(pseudo);
    if (invalide) return rep({ error: 'bad_request', message: invalide }, 400);
    const papa = await depot.creerPapa(env.DB, {
      pseudo, ville: nettoyer(corps.ville).slice(0, 40), dept: nettoyer(corps.dept).slice(0, 40),
    });
    return rep({ papa: publier(papa), jeton: papa.jeton }, 201);
  }

  if (path === '/fil' && request.method === 'GET') {
    const papa = await papaCourant(request, env); // facultatif ici
    const posts = await depot.listerFil(env.DB, {
      dept: url.searchParams.get('dept') || null,
      avant: url.searchParams.get('avant') || null,
      papaId: papa?.id || null,
    });
    return rep({ posts: posts.map(publierPost) });
  }

  const commentaires = path.match(/^\/posts\/([0-9a-f-]{36})\/commentaires$/);
  if (commentaires && request.method === 'GET') {
    return rep({ commentaires: (await depot.listerCommentaires(env.DB, commentaires[1])).map(publierCommentaire) });
  }

  // Admin : authentifiée par le secret X-Wassim-Auth uniquement (pas besoin
  // d'identité papa) — avant le garde-fou d'écriture.
  if (path.startsWith('/admin/')) {
    if (!env.WASSIM_AUTH_TOKEN || request.headers.get('X-Wassim-Auth') !== env.WASSIM_AUTH_TOKEN) {
      return rep({ error: 'unauthorized' }, 401);
    }
    if (path === '/admin/signalements') return rep({ signalements: await depot.listerSignalements(env.DB) });
    if (post) {
      const corps = await corpsJson(request);
      if (path === '/admin/masquer') {
        await depot.masquer(env.DB, corps.cibleType === 'commentaire' ? 'commentaire' : 'post', String(corps.cibleId));
        return rep({ ok: true });
      }
      if (path === '/admin/bannir') {
        await depot.bannir(env.DB, String(corps.papaId));
        return rep({ ok: true });
      }
    }
    return rep({ error: 'not_found' }, 404);
  }

  // Tout ce qui suit écrit : identité requise.
  if (!post) return rep({ error: 'not_found' }, 404);
  const papa = await papaCourant(request, env);
  if (!papa) return rep({ error: 'unauthorized', message: 'Identité inconnue — inscris-toi d’abord.' }, 401);
  if (papa.banni) return rep({ error: 'forbidden', message: 'Ce compte est suspendu.' }, 403);

  if (path === '/posts') {
    const corps = await corpsJson(request);
    const invalide = validerTypePost(corps.type) || validerTextePost(corps.texte);
    if (invalide) return rep({ error: 'bad_request', message: invalide }, 400);
    const maxParHeure = Number(env.MAX_POSTS_PAR_HEURE || 5);
    if (await depot.postsRecents(env.DB, papa.id, 60) >= maxParHeure) {
      return rep({ error: 'rate_limited', message: 'Doucement chef — reviens dans un moment.' }, 429);
    }
    const { id } = await depot.creerPost(env.DB, {
      papaId: papa.id, type: corps.type, texte: nettoyer(corps.texte),
      ville: papa.ville, dept: papa.dept,
    });
    return rep({ ok: true, id }, 201);
  }

  const reaction = path.match(/^\/posts\/([0-9a-f-]{36})\/reaction$/);
  if (reaction) {
    if (!(await depot.postParId(env.DB, reaction[1]))) return rep({ error: 'not_found' }, 404);
    return rep(await depot.basculerReaction(env.DB, reaction[1], papa.id));
  }

  const commenter = path.match(/^\/posts\/([0-9a-f-]{36})\/commentaires$/);
  if (commenter) {
    const cible = await depot.postParId(env.DB, commenter[1]);
    if (!cible || cible.masque) return rep({ error: 'not_found' }, 404);
    const corps = await corpsJson(request);
    const invalide = validerCommentaire(corps.texte);
    if (invalide) return rep({ error: 'bad_request', message: invalide }, 400);
    const { id } = await depot.creerCommentaire(env.DB, {
      postId: commenter[1], papaId: papa.id, texte: nettoyer(corps.texte),
    });
    return rep({ ok: true, id }, 201);
  }

  if (path === '/signalements') {
    const corps = await corpsJson(request);
    const cibleType = corps.cibleType === 'commentaire' ? 'commentaire' : 'post';
    const cibleId = nettoyer(corps.cibleId);
    if (!/^[0-9a-f-]{36}$/.test(cibleId)) return rep({ error: 'bad_request' }, 400);
    const total = await depot.signaler(env.DB, {
      cibleType, cibleId, papaId: papa.id, raison: nettoyer(corps.raison).slice(0, 200),
    });
    // Masquage automatique en attendant l'arbitrage de l'admin.
    if (total >= Number(env.SEUIL_SIGNALEMENTS || 3)) await depot.masquer(env.DB, cibleType, cibleId);
    return rep({ ok: true, message: 'Merci — on regarde.' }, 201);
  }

  return rep({ error: 'not_found' }, 404);
}

async function papaCourant(request, env) {
  const entete = request.headers.get('Authorization') || '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : null;
  return await depot.papaParJeton(env.DB, jeton);
}

async function corpsJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

/** Ce que l'app voit d'un papa (jamais le jeton ni l'id des autres). */
function publier(papa) {
  return {
    id: papa.id, pseudo: papa.pseudo, ville: papa.ville, dept: papa.dept,
    numero: papa.numero, fondateur: papa.numero != null && papa.numero <= FONDATEURS,
  };
}

function publierPost(p) {
  return {
    id: p.id, type: p.type, texte: p.texte, creeLe: p.cree_le,
    auteur: { pseudo: p.pseudo, ville: p.auteur_ville, fondateur: p.auteur_numero != null && p.auteur_numero <= FONDATEURS },
    pouces: p.pouces || 0, nbCommentaires: p.nb_commentaires || 0,
    monPouce: !!p.mon_pouce,
  };
}

function publierCommentaire(c) {
  return {
    id: c.id, texte: c.texte, creeLe: c.cree_le,
    auteur: { pseudo: c.pseudo, ville: c.auteur_ville, fondateur: c.auteur_numero != null && c.auteur_numero <= FONDATEURS },
  };
}
