// Worker on-sort-poc — point d'entrée.
// POC « On sort ? » (week-end 1 du side hustle) : valide sur données réelles
// que l'on peut sortir un top 5 de sorties famille pertinent autour de
// Rennes, avant de builder l'app mobile.
//
// Endpoints (tous publics — uniquement des données ouvertes, rien à protéger) :
//   GET /health      — état du worker
//   GET /top         — le produit : top 5 scoré pour une date/position/âge
//                      ?date=YYYY-MM-DD (défaut : samedi prochain)
//                      &lat=&lon=       (défaut : Rennes)
//                      &age=            (défaut : 3)
//                      &rayon=          (km, défaut : 40)
//                      &dept=&code=     (défaut : Ille-et-Vilaine / 35)
//   GET /diagnostic  — le go/no-go du POC : comptages réels par source,
//                      part d'événements « famille », échantillons, verdict.

import { jsonResponse, preflightResponse } from './cors.js';
import { evenementsOpenAgenda } from './sources/openagenda.js';
import { evenementsDatatourisme } from './sources/datatourisme.js';
import { previsionJour } from './meteo.js';
import { top } from './scoring.js';
import { scoreFamille } from './famille.js';
import { MOCK_EVENEMENTS, MOCK_METEO, isMock } from './mocks.js';

const DEFAUTS = {
  lat: 48.1173, lon: -1.6778, // Rennes
  age: 3, rayonKm: 40,
  departement: 'Ille-et-Vilaine', codeDepartement: '35',
};
const CACHE_TTL = 6 * 3600; // les agendas bougent peu en journée
/** Piliers en teaser dont on compte les « Ça m'intéresse ». */
const PILIERS = ['couple', 'moi', 'tribu'];

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path === '/') {
      return jsonResponse({ ok: true, worker: 'on-sort-poc', mock: isMock(env), ts: new Date().toISOString() }, 200, request, env);
    }

    try {
      if (path === '/top' && request.method === 'GET') {
        return await repondreAvecCache(request, env, ctx, () => calculerTop(request, url, env));
      }
      if (path === '/diagnostic' && request.method === 'GET') {
        return jsonResponse(await diagnostic(url, env), 200, request, env);
      }
      // Votes « Ça m'intéresse » des piliers en teaser (Couple/Moi/Tribu) :
      // une clé KV par appareil et par pilier — idempotent, comptage par
      // préfixe (list plafonné à 1000 : largement assez pour la beta).
      if (path === '/votes' && request.method === 'POST') {
        if (!env.VOTES) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const corps = (await request.json().catch(() => null)) || {};
        const pilier = String(corps.pilier || '');
        const appareil = String(corps.appareil || '');
        if (!PILIERS.includes(pilier) || !/^[0-9a-f-]{8,64}$/i.test(appareil)) {
          return jsonResponse({ error: 'bad_request' }, 400, request, env);
        }
        await env.VOTES.put(`vote:${pilier}:${appareil.toLowerCase()}`, '1');
        const total = (await env.VOTES.list({ prefix: `vote:${pilier}:`, limit: 1000 })).keys.length;
        return jsonResponse({ ok: true, pilier, total }, 201, request, env);
      }
      if (path === '/votes' && request.method === 'GET') {
        if (!env.VOTES) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const totaux = {};
        for (const pilier of PILIERS) {
          totaux[pilier] = (await env.VOTES.list({ prefix: `vote:${pilier}:`, limit: 1000 })).keys.length;
        }
        return jsonResponse({ votes: totaux }, 200, request, env);
      }
    } catch (e) {
      return jsonResponse({ error: 'internal', message: String(e.message || e) }, 500, request, env);
    }

    return jsonResponse({ error: 'not_found' }, 404, request, env);
  },
};

/** Paramètres de la requête avec défauts Rennes/3 ans. */
function lireParams(url) {
  // Attention : Number(null) vaut 0 — il faut tester la présence du paramètre
  // avant de convertir, sinon lat/lon absents deviennent (0,0).
  const num = (nom) => {
    const s = url.searchParams.get(nom);
    if (s === null || s.trim() === '') return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  return {
    dateISO: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
      ? url.searchParams.get('date')
      : prochainSamedi(),
    lat: num('lat') ?? DEFAUTS.lat,
    lon: num('lon') ?? DEFAUTS.lon,
    age: num('age') ?? DEFAUTS.age,
    rayonKm: num('rayon') ?? DEFAUTS.rayonKm,
    departement: url.searchParams.get('dept') || DEFAUTS.departement,
    codeDepartement: url.searchParams.get('code') || DEFAUTS.codeDepartement,
  };
}

/** Prochain samedi (aujourd'hui si on est samedi), heure de Paris ≈ UTC ici. */
function prochainSamedi() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** L'événement a-t-il lieu (ou court-il) à la date demandée ? */
function actifCeJour(ev, dateISO) {
  if (!ev.dateDebut) return true; // pas d'info date (mock) : on garde
  if (ev.dateFin) return ev.dateDebut <= dateISO && dateISO <= ev.dateFin;
  return ev.dateDebut === dateISO;
}

async function calculerTop(request, url, env) {
  const p = lireParams(url);

  let evenements;
  let meteo;
  const sources = {};
  if (isMock(env)) {
    evenements = MOCK_EVENEMENTS;
    meteo = MOCK_METEO;
    sources.mock = { ok: true, count: evenements.length };
  } else {
    const [oa, dt, prev] = await Promise.all([
      evenementsOpenAgenda(env, p),
      evenementsDatatourisme(env, p),
      previsionJour(env, p.lat, p.lon, p.dateISO),
    ]);
    meteo = prev;
    sources.openagenda = { ok: oa.ok, count: oa.evenements.length, ...(oa.erreur ? { erreur: oa.erreur } : {}) };
    sources.datatourisme = { ok: dt.ok, count: dt.evenements.length, ...(dt.endpoint ? { endpoint: dt.endpoint } : {}) };
    evenements = [...oa.evenements, ...dt.evenements].filter((ev) => actifCeJour(ev, p.dateISO));
  }

  const resultat = top(evenements, { dateISO: p.dateISO, lat: p.lat, lon: p.lon, age: p.age, rayonKm: p.rayonKm, meteo });
  return {
    mock: isMock(env),
    date: p.dateISO,
    position: { lat: p.lat, lon: p.lon },
    age: p.age,
    rayonKm: p.rayonKm,
    meteo,
    sources,
    stats: { total: resultat.total, uniques: resultat.uniques, retenus: resultat.retenus },
    preferee: resultat.top[0] || null,
    top: resultat.top,
  };
}

/**
 * Le go/no-go du week-end 1 : sonde chaque source sur données réelles et
 * mesure la densité d'événements famille. En mode mock, dit juste que le
 * diagnostic n'a pas de sens sur des données fictives.
 */
async function diagnostic(url, env) {
  if (isMock(env)) {
    return { mock: true, message: 'MOCK_MODE actif — le diagnostic ne se lit que sur données réelles.' };
  }
  const p = lireParams(url);
  const [oa, dt, meteo] = await Promise.all([
    evenementsOpenAgenda(env, p),
    evenementsDatatourisme(env, p),
    previsionJour(env, p.lat, p.lon, p.dateISO),
  ]);

  const analyse = (evenements) => {
    const famille = evenements.filter((ev) => scoreFamille(ev) >= 2);
    const compatibles = evenements.filter((ev) => scoreFamille(ev) >= 1);
    return {
      count: evenements.length,
      familleExplicite: famille.length,
      familleCompatible: compatibles.length,
      echantillonFamille: famille.slice(0, 5).map((ev) => ev.titre),
      echantillonBrut: evenements.slice(0, 5).map((ev) => ev.titre),
    };
  };

  const bilanOA = analyse(oa.evenements);
  const retenus = top([...oa.evenements, ...dt.evenements].filter((ev) => actifCeJour(ev, p.dateISO)),
    { dateISO: p.dateISO, lat: p.lat, lon: p.lon, age: p.age, rayonKm: p.rayonKm, meteo }).retenus;

  return {
    mock: false,
    date: p.dateISO,
    departement: p.departement,
    meteo,
    openagenda: { ok: oa.ok, ...(oa.erreur ? { erreur: oa.erreur } : {}), ...bilanOA },
    datatourisme: dt.ok
      ? { ok: true, endpoint: dt.endpoint, ...analyse(dt.evenements), erreursSondees: dt.erreurs }
      : { ok: false, erreursSondees: dt.erreurs },
    retenusApresScoring: retenus,
    verdict: retenus >= 10 ? 'GO — densité largement suffisante'
      : retenus >= 3 ? 'LIMITE — ça passe pour un top 5, à re-tester sur plusieurs dates'
        : 'NO-GO sur cette date — re-tester d’autres dates/rayons avant de conclure',
  };
}

/** Cache HTTP (6 h) sur les réponses live — les sources sont lentes.
 *  `?fresh=1` force le recalcul (un redéploiement ne purge pas le cache). */
async function repondreAvecCache(request, env, ctx, calcul) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const utilisable = !fresh && !isMock(env) && typeof caches !== 'undefined' && caches.default;
  const cle = new Request(request.url, { method: 'GET' });
  if (utilisable) {
    const enCache = await caches.default.match(cle);
    if (enCache) return enCache;
  }
  const corps = await calcul();
  const reponse = jsonResponse(corps, 200, request, env, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  });
  if (utilisable && ctx?.waitUntil) ctx.waitUntil(caches.default.put(cle, reponse.clone()));
  return reponse;
}
