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
//   GET  /admin/api/cirques    état des tournées de cirques (dernière lecture)
//   POST /admin/api/cirques    relit les sites des cirques tout de suite
//   GET  /admin/api/propositions   propositions des organisateurs (en attente d'abord)
//   POST /admin/api/propositions   {id, action: valider|refuser, motif?, champs?}
//   GET  /admin/api/prospection    lieux à inviter et leur suivi
//   POST /admin/api/prospection    {id, statut?, note?}
//   GET  /admin/api/concours       concours + nombre de participants
//   POST /admin/api/concours       {action: enregistrer|tirer|prevenir, …}
//   GET  /admin/api/concours/participants?id=   export CSV
//   GET  /admin/api/veille         veille concurrente (dernier relevé, historique)
//   POST /admin/api/veille         relevé immédiat
//
// Accès : en-tête `Authorization: Bearer <ADMIN_TOKEN>`. ADMIN_TOKEN est un
// secret Cloudflare (`npx wrangler secret put ADMIN_TOKEN`). Sans lui,
// l'admin est fermée (503) — jamais ouverte par défaut.

import { jsonResponse } from '../cors.js';
import { evaluer, selectionner, dedoublonner } from '../scoring.js';
import { VILLES, villeParId } from '../villes.js';
import {
  lireSurcouche, lireJournal, appliquerSurcouche, executerAction, cleEvenement,
} from './surcouche.js';
import { pageAdmin } from './page.js';
import { actualiserTournees, etatTournees } from '../sources/cirques.js';
import { listerPropositions, deciderProposition } from '../propositions.js';
import { lireProspection, majLieu } from './prospection.js';
import { listerConcours, agirConcours, csvParticipants } from '../concours.js';
import { releverVeille, lireVeille } from '../veille.js';

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

  // Tournées des cirques : état de la dernière lecture (GET) ou relecture
  // immédiate sans attendre le cron du matin (POST).
  // Propositions des organisateurs : la file, et la décision (valider crée la
  // sortie manuelle et prévient l'organisateur ; refuser le prévient aussi).
  if (path === '/admin/api/propositions' && request.method === 'GET') {
    return rep({ propositions: await listerPropositions(env) });
  }
  if (path === '/admin/api/propositions' && request.method === 'POST') {
    const corps = await request.json().catch(() => null);
    if (!corps || !corps.id) return rep({ error: 'bad_request' }, 400);
    const r = await deciderProposition(env, corps);
    if (r.erreur) return rep({ error: 'bad_request', message: r.erreur }, 400);
    return rep(r);
  }

  // Veille concurrente (src/veille.js) : dernier relevé, ou relevé immédiat.
  if (path === '/admin/api/veille' && request.method === 'GET') {
    return rep(await lireVeille(env));
  }
  if (path === '/admin/api/veille' && request.method === 'POST') {
    try {
      const resume = await releverVeille(env, { ...deps, lireSurcouche, appliquerSurcouche });
      return rep({ ok: true, resume });
    } catch (e) {
      return rep({ error: 'veille', message: String(e.message || e) }, 502);
    }
  }

  // Concours (src/concours.js) : liste, création/édition, tirage, envoi aux gagnants, export.
  if (path === '/admin/api/concours' && request.method === 'GET') {
    return rep(await listerConcours(env));
  }
  if (path === '/admin/api/concours' && request.method === 'POST') {
    const corps = await request.json().catch(() => null);
    if (!corps || !corps.action) return rep({ error: 'bad_request' }, 400);
    const r = await agirConcours(env, corps);
    if (r.erreur) return rep({ error: 'bad_request', message: r.erreur }, 400);
    return rep(r);
  }
  if (path === '/admin/api/concours/participants' && request.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    // BOM en tête : Excel ouvre alors le CSV en UTF-8 (accents corrects).
    return new Response(`﻿${await csvParticipants(env, id)}`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="concours-${id.replace(/[^a-z0-9-]/g, '')}.csv"`, ...SANS_CACHE },
    });
  }

  // Prospection des lieux (src/admin/prospection.js).
  if (path === '/admin/api/prospection' && request.method === 'GET') {
    return rep(await lireProspection(env));
  }
  if (path === '/admin/api/prospection' && request.method === 'POST') {
    const corps = await request.json().catch(() => null);
    if (!corps || !corps.id) return rep({ error: 'bad_request' }, 400);
    const r = await majLieu(env, corps);
    if (r.erreur) return rep({ error: 'bad_request', message: r.erreur }, 400);
    return rep(r);
  }

  if (path === '/admin/api/cirques' && request.method === 'GET') {
    return rep(await etatTournees(env));
  }
  if (path === '/admin/api/cirques' && request.method === 'POST') {
    return rep(await actualiserTournees(env));
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

  // Un seul passage de scoring, comme /top : le plan gratuit coupe le worker
  // au-delà de ~10 ms de CPU (erreur 1102), et scorer deux fois chaque
  // sortie d'une grande ville suffisait à la dépasser. Masquées et doublons
  // ne sont pas scorés : ils n'entrent pas dans le top.
  const tous = appliquerSurcouche(bruts, surcouche, p.dateISO, { garderMasques: true });
  const visibles = tous.filter((ev) => !ev.masque);
  const uniques = new Set(dedoublonner(visibles).map((ev) => ev.cle));
  const evaluations = new Map();
  for (const ev of visibles) if (uniques.has(ev.cle)) evaluations.set(ev.cle, evaluer(ev, ctx));
  const scores = [...evaluations.values()].filter((e) => !e.exclu);
  const selection = selectionner(scores);
  const rangs = new Map(selection.map((ev, i) => [ev.cle, i + 1]));
  const originaux = new Map(bruts.map((ev) => [cleEvenement(ev), ev]));

  const evenements = tous.map((ev) => {
    const e = evaluations.get(ev.cle) || {};
    const doublon = !ev.masque && !uniques.has(ev.cle);
    const brut = originaux.get(ev.cle);
    return {
      cle: ev.cle,
      origine: ev.origine,
      titre: ev.titre,
      // Tronquée : sérialiser 1 200 caractères × 500 sorties pèse sur le CPU.
      description: (ev.description || '').slice(0, 600),
      ville: ev.ville || null,
      lieuNom: ev.lieuNom || null,
      adresse: ev.adresse || null,
      dateDebut: ev.dateDebut || null,
      dateFin: ev.dateFin || null,
      horaires: (e.exclu === undefined && e.horaires) || ev.horaires || null,
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
      score: e.score ?? null,
      raisons: e.raisons || [],
      motif: doublon ? 'doublon' : (e.exclu || null),
      distanceKm: e.distanceKm ?? null,
      age: e.age || null,
      lieuType: e.lieuType || null,
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
    stats: { total: visibles.length, uniques: uniques.size, retenus: scores.length },
    top: selection.map((ev) => ev.cle),
    evenements,
  };
}
