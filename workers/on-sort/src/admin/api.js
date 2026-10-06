// Back-office — réservé à Wassim.
//
//   GET  /admin                la page (coquille HTML sans donnée, publique)
//   GET  /admin/api/moi        vérifie le jeton ; rend les villes et le mode
//   GET  /admin/api/ville      TOUTES les sorties d'une ville pour une date,
//                              avec score détaillé, motif d'exclusion, rang
//                              dans le top et état admin (?ville=&date=&age=&rayon=)
//   GET  /admin/api/surcouche  masquées / corrections / épinglées / manuelles
//   POST /admin/api/action     une modification (voir surcouche.js)
//   GET  /admin/api/journal    les dernières modifications, annulables
//   GET  /admin/api/stats      usage (?jours=30), votes, villes demandées
//
// Accès : en-tête `Authorization: Bearer <ADMIN_TOKEN>`. ADMIN_TOKEN est un
// secret Cloudflare (`npx wrangler secret put ADMIN_TOKEN`). Sans lui,
// l'admin est fermée (503) — jamais ouverte par défaut.

import { jsonResponse } from '../cors.js';
import { evaluer, top, dedoublonner } from '../scoring.js';
import { libelleHoraires } from '../horaires.js';
import { VILLES, villeParId } from '../villes.js';
import {
  lireSurcouche, lireJournal, appliquerSurcouche, executerAction, cleEvenement,
} from './surcouche.js';
import { pageAdmin } from './page.js';

/** Comparaison à temps constant : la durée ne trahit pas la longueur commune. */
function memeSecret(a, b) {
  const ea = new TextEncoder().encode(String(a));
  const eb = new TextEncoder().encode(String(b));
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

function autorise(request, env) {
  const entete = request.headers.get('Authorization') || '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : '';
  return Boolean(jeton) && memeSecret(jeton, env.ADMIN_TOKEN);
}

const SANS_CACHE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

export async function routeAdmin(request, env, url, path, deps) {
  const rep = (body, status = 200) => jsonResponse(body, status, request, env, SANS_CACHE);

  if (path === '/admin' && request.method === 'GET') {
    return new Response(pageAdmin(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...SANS_CACHE,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'unsafe-inline'",
          "style-src 'unsafe-inline' https://fonts.googleapis.com",
          'font-src https://fonts.gstatic.com',
          "connect-src 'self'",
          "img-src 'self' data:",
          "frame-ancestors 'none'",
        ].join('; '),
        'Referrer-Policy': 'no-referrer',
      },
    });
  }

  if (!env.ADMIN_TOKEN) return rep({ error: 'admin_fermee', message: 'Secret ADMIN_TOKEN absent : admin désactivée.' }, 503);
  if (!autorise(request, env)) return rep({ error: 'unauthorized' }, 401);
  if (!env.VOTES) return rep({ error: 'kv_not_bound' }, 503);

  if (path === '/admin/api/moi' && request.method === 'GET') {
    return rep({ ok: true, mock: env.MOCK_MODE === 'true', villes: VILLES });
  }

  if (path === '/admin/api/ville' && request.method === 'GET') {
    const ville = villeParId(url.searchParams.get('ville') || '');
    if (!ville) return rep({ error: 'ville_inconnue' }, 400);
    return rep(await analyserVille(env, url, ville, deps));
  }

  if (path === '/admin/api/surcouche' && request.method === 'GET') {
    return rep({ surcouche: await lireSurcouche(env) });
  }

  if (path === '/admin/api/journal' && request.method === 'GET') {
    return rep({ journal: await lireJournal(env) });
  }

  if (path === '/admin/api/action' && request.method === 'POST') {
    const action = await request.json().catch(() => null);
    if (!action || typeof action !== 'object') return rep({ error: 'bad_request' }, 400);
    const r = await executerAction(env, action);
    if (r.erreur) return rep({ error: 'bad_request', message: r.erreur }, 400);
    return rep({ ok: true, surcouche: r.surcouche, entree: r.entree });
  }

  if (path === '/admin/api/stats' && request.method === 'GET') {
    const demandes = Number.parseInt(url.searchParams.get('jours') || '30', 10);
    const jours = Math.min(Math.max(Number.isFinite(demandes) ? demandes : 30, 1), 90);
    const [mesures, votes, villesDemandees] = await Promise.all([
      deps.mesures(env, jours), deps.totauxVotes(env), deps.villesDemandees(env),
    ]);
    return rep({ mesures, votes, villesDemandees });
  }

  return rep({ error: 'not_found' }, 404);
}

/**
 * Toutes les sorties d'une ville pour une date — y compris celles que /top
 * écarte, avec la raison. C'est ce que l'admin affiche, ville par ville.
 */
async function analyserVille(env, url, ville, deps) {
  const params = new URL(url);
  params.searchParams.set('city', ville.id);
  const p = deps.lireParams(params);
  const [{ evenements: bruts, meteo, sources }, surcouche] = await Promise.all([
    deps.chargerSources(env, p), lireSurcouche(env),
  ]);
  const ctx = { dateISO: p.dateISO, lat: p.lat, lon: p.lon, age: p.age, rayonKm: p.rayonKm, meteo };

  const tous = appliquerSurcouche(bruts, surcouche, p.dateISO, { garderMasques: true });
  const visibles = tous.filter((ev) => !ev.masque);
  const resultat = top(visibles, ctx);
  const rangs = new Map(resultat.top.map((ev, i) => [ev.cle, i + 1]));
  const uniques = new Set(dedoublonner(visibles).map((ev) => ev.cle));
  const originaux = new Map(bruts.map((ev) => [cleEvenement(ev), ev]));

  const evenements = tous.map((ev) => {
    const e = evaluer(ev, ctx);
    const doublon = !ev.masque && !uniques.has(ev.cle);
    const brut = originaux.get(ev.cle);
    return {
      cle: ev.cle,
      origine: ev.origine,
      titre: ev.titre,
      description: ev.description || '',
      ville: ev.ville || null,
      lieuNom: ev.lieuNom || null,
      adresse: ev.adresse || null,
      dateDebut: ev.dateDebut || null,
      dateFin: ev.dateFin || null,
      horaires: libelleHoraires(ev, p.dateISO) || ev.horaires || null,
      horairesBruts: ev.horaires || null,
      url: ev.url || null,
      gratuit: ev.gratuit ?? null,
      lat: ev.lat ?? null,
      lon: ev.lon ?? null,
      ageMin: ev.ageMin ?? null,
      ageMax: ev.ageMax ?? null,
      source: ev.source || null,
      majLe: ev.majLe || null,
      masque: Boolean(ev.masque),
      epingle: Boolean(ev.epingle),
      manuel: ev.origine === 'manuel',
      corrige: ev.corrige || null,
      original: ev.corrige && brut ? Object.fromEntries(ev.corrige.map((k) => [k, brut[k] ?? null])) : null,
      score: e.exclu || doublon ? null : e.score,
      raisons: e.exclu || doublon ? [] : e.raisons,
      motif: doublon ? 'doublon' : (e.exclu || null),
      distanceKm: e.distanceKm ?? null,
      age: e.exclu ? null : e.age,
      lieuType: e.exclu ? null : e.lieuType,
      rang: rangs.get(ev.cle) || null,
    };
  });

  return {
    ville: { id: ville.id, nom: ville.nom, dept: ville.dept, code: ville.code },
    date: p.dateISO,
    age: p.age,
    rayonKm: p.rayonKm,
    meteo,
    sources,
    stats: { total: resultat.total, uniques: resultat.uniques, retenus: resultat.retenus },
    top: resultat.top.map((ev) => ev.cle),
    evenements,
  };
}
