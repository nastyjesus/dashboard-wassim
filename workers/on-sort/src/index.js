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
//                      &city=           (une ville de l'app, par id ou nom :
//                                        donne lat/lon/dept/code ; ceux passés
//                                        explicitement restent prioritaires ;
//                                        lat/lon sans dept/code → département
//                                        de la ville de l'app la plus proche.
//                                        Ville inconnue → 400, pas Rennes.)
//   GET /diagnostic  — le go/no-go du POC : comptages réels par source,
//                      part d'événements « famille », échantillons, verdict.
//   POST /votes      — vote « Ça m'intéresse » d'un pilier en teaser
//   GET  /votes      — les totaux par pilier
//   POST /propositions — un organisateur propose une sortie (src/propositions.js)
//   GET  /photos/<id>  — photo d'une proposition
//   GET  /encart?ville=&page=[&jour=] — encart HTML des pages thématiques du site
//   POST /ville-demande — demande d'ajout d'une ville (filet si Supabase KO)
//   GET  /ville-demande — les villes demandées, triées par fréquence
//   POST /mesure     — incrémente un compteur d'usage (aucun identifiant)
//   GET  /mesures    — les compteurs par jour (?jours=14)
//   GET  /desabonnement?jeton= — coupe l'alerte du week-end, sans mot de passe
//   GET  /admin + /admin/api/* — back-office de Wassim (secret ADMIN_TOKEN,
//                      voir src/admin/api.js). Ses consignes (sorties masquées,
//                      corrigées, épinglées, ajoutées) s'appliquent à /top.
//
// Et deux travaux programmés ([triggers] dans wrangler.toml) :
//  - chaque matin, les tournées des cirques sont relues sur leurs sites
//    (src/sources/cirques.js) et rangées en KV pour /top ;
//  - le vendredi, l'alerte du week-end part par e-mail aux papas qui l'ont
//    demandée (voir src/alerte.js).

import { jsonResponse, preflightResponse } from './cors.js';
import { evenementsOpenAgenda } from './sources/openagenda.js';
import { evenementsDatatourisme } from './sources/datatourisme.js';
import { evenementsMediathequesLorient } from './sources/mediatheques-lorient.js';
import { evenementsParis } from './sources/paris.js';
import { evenementsCirques, actualiserTournees, etatTournees } from './sources/cirques.js';
import { previsionJour } from './meteo.js';
import { top } from './scoring.js';
import { scoreFamille } from './famille.js';
import { envoyerAlertes, desabonner, pageDesabonnement } from './alerte.js';
import { MOCK_EVENEMENTS, MOCK_METEO, isMock } from './mocks.js';
import { villeParNomOuId, villeLaPlusProche } from './villes.js';
import { pourAffichage } from './texte.js';
import { recevoirProposition, servirPhoto } from './propositions.js';
import { calculerEncart } from './encart.js';
import { lireSurcouche, appliquerSurcouche } from './admin/surcouche.js';
import { routeAdmin } from './admin/api.js';

const DEFAUTS = {
  lat: 48.1173, lon: -1.6778, // Rennes
  age: 3, rayonKm: 40,
  departement: 'Ille-et-Vilaine', codeDepartement: '35',
};
const CACHE_TTL = 6 * 3600; // les agendas bougent peu en journée
// Version de clé de cache : bump à chaque changement de scoring (ou de lecture
// des paramètres, ex. ?city=) pour invalider
// d'un coup les tops déjà en cache (un redéploiement seul ne purge pas le cache).
const CACHE_VERSION = 'scoring-2026-10-06-paragraphes';
/** Cron quotidien des tournées de cirques — identique à wrangler.toml. */
const CRON_CIRQUES = '0 5 * * *';
/** Piliers en teaser dont on compte les « Ça m'intéresse ». */
const PILIERS = ['couple', 'moi', 'tribu'];

/** Étapes d'usage comptées. Des compteurs, pas un traçage : aucun identifiant
 *  d'appareil, aucun profil, rien qui permette de suivre une personne.
 *  - ouverture     : l'app démarre
 *  - arrivee-lien  : elle démarre avec ville/âge dans l'URL (venu du site)
 *  - top / top-vide: un top a été affiché, avec ou sans résultat
 *  - garde         : une sortie a été mise de côté
 *  - compte        : un compte a été créé
 *  Ces cinq étapes suffisent à lire l'entonnoir site → sortie → compte. */
const MESURES = ['ouverture', 'arrivee-lien', 'top', 'top-vide', 'garde', 'compte', 'alerte-envoyee'];
const MESURES_JOURS_MAX = 90;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path === '/') {
      return jsonResponse({ ok: true, worker: 'on-sort-poc', mock: isMock(env), ts: new Date().toISOString() }, 200, request, env);
    }

    try {
      if (path === '/admin' || path.startsWith('/admin/')) {
        return await routeAdmin(request, env, url, path, {
          lireParams, chargerSources, mesures, totauxVotes, villesDemandees,
        });
      }
      if (path === '/top' && request.method === 'GET') {
        const { villeInconnue } = lireParams(url);
        if (villeInconnue) return jsonResponse({ error: 'ville_inconnue', ville: villeInconnue }, 400, request, env);
        // Lue avant le cache : sa version entre dans la clé, donc une
        // modification admin se voit tout de suite au lieu d'attendre 6 h.
        const surcouche = await lireSurcouche(env);
        return await repondreAvecCache(request, env, ctx, () => calculerTop(request, url, env, surcouche), surcouche.version);
      }
      if (path === '/diagnostic' && request.method === 'GET') {
        return jsonResponse(await diagnostic(url, env), 200, request, env);
      }
      // Propositions de sorties par les organisateurs (formulaire du site
      // WordPress) et leurs photos — voir src/propositions.js.
      if (path === '/propositions' && request.method === 'POST') {
        const { status, corps } = await recevoirProposition(request, env, ctx);
        return jsonResponse(corps, status, request, env);
      }
      // Encart des pages thématiques du site (shortcode WordPress) — src/encart.js.
      if (path === '/encart' && request.method === 'GET') {
        return await servirEncart(request, url, env, ctx);
      }
      if (path.startsWith('/photos/') && request.method === 'GET') {
        return (await servirPhoto(env, path.slice('/photos/'.length))) || jsonResponse({ error: 'not_found' }, 404, request, env);
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
        return jsonResponse({ votes: await totauxVotes(env) }, 200, request, env);
      }
      // Demandes de ville : filet de secours quand Supabase n'est pas joignable
      // (l'app écrit normalement dans la table `demandes_ville`). Une clé KV par
      // demande, préfixée par la ville normalisée pour pouvoir compter.
      if (path === '/ville-demande' && request.method === 'POST') {
        if (!env.VOTES) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const corps = (await request.json().catch(() => null)) || {};
        const ville = String(corps.ville || '').trim().slice(0, 80);
        const email = corps.email ? String(corps.email).trim().toLowerCase().slice(0, 120) : null;
        const code = corps.code ? String(corps.code).trim().slice(0, 3) : null;
        if (ville.length < 2) return jsonResponse({ error: 'bad_request' }, 400, request, env);
        const cle = `ville:${normaliserVille(ville)}:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        await env.VOTES.put(cle, JSON.stringify({ ville, email, code, le: new Date().toISOString() }));
        return jsonResponse({ ok: true, ville }, 201, request, env);
      }
      if (path === '/ville-demande' && request.method === 'GET') {
        if (!env.VOTES) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        return jsonResponse({ demandes: await villesDemandees(env) }, 200, request, env);
      }
      // Compteurs d'usage. Une clé par jour et par étape, incrémentée en
      // lecture-écriture : KV n'a pas d'incrément atomique, deux écritures
      // simultanées peuvent donc en perdre une. Assumé — on cherche une
      // tendance (l'entrée sans compte a-t-elle fait bouger l'usage ?), pas
      // une comptabilité. Si le volume rend l'écart gênant, passer sur
      // Analytics Engine.
      if (path === '/mesure' && request.method === 'POST') {
        if (!env.VOTES) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const corps = (await request.json().catch(() => null)) || {};
        const evt = String(corps.evt || '');
        if (!MESURES.includes(evt)) return jsonResponse({ error: 'bad_request' }, 400, request, env);
        const cle = `cpt:${jourISO()}:${evt}`;
        const actuel = Number.parseInt((await env.VOTES.get(cle)) || '0', 10) || 0;
        await env.VOTES.put(cle, String(actuel + 1));
        return jsonResponse({ ok: true }, 202, request, env);
      }
      // Désabonnement : un clic depuis un e-mail, sans compte ni mot de passe.
      // Le jeton du lien identifie l'inscription et rien d'autre.
      if (path === '/desabonnement' && request.method === 'GET') {
        const resultat = await desabonner(env, url.searchParams.get('jeton'));
        const code = resultat.ok ? 200 : (resultat.motif === 'panne' ? 503 : 404);
        return new Response(pageDesabonnement(resultat), {
          status: code,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      if (path === '/mesures' && request.method === 'GET') {
        if (!env.VOTES) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const demandes = Number.parseInt(url.searchParams.get('jours') || '14', 10);
        const jours = Math.min(Math.max(Number.isFinite(demandes) ? demandes : 14, 1), MESURES_JOURS_MAX);
        return jsonResponse(await mesures(env, jours), 200, request, env);
      }
    } catch (e) {
      return jsonResponse({ error: 'internal', message: String(e.message || e) }, 500, request, env);
    }

    return jsonResponse({ error: 'not_found' }, 404, request, env);
  },

  // Travaux programmés (voir [triggers] dans wrangler.toml) : CRON_CIRQUES
  // relit les tournées, l'autre est l'alerte du week-end du vendredi.
  // Le résumé part dans les logs — `npx wrangler tail` pour le lire en direct.
  async scheduled(event, env, ctx) {
    if (event.cron === CRON_CIRQUES) {
      ctx.waitUntil(
        actualiserTournees(env)
          .then((resume) => console.log('tournées des cirques :', JSON.stringify(resume)))
          .catch((e) => console.error('tournées des cirques, échec :', e.message || e)),
      );
      return;
    }
    ctx.waitUntil(
      envoyerAlertes(env)
        .then((resume) => console.log('alerte week-end :', JSON.stringify(resume)))
        .catch((e) => console.error('alerte week-end, échec :', e.message || e)),
    );
  },
};

/** Totaux « Ça m'intéresse » par pilier. */
async function totauxVotes(env) {
  const totaux = {};
  for (const pilier of PILIERS) {
    totaux[pilier] = (await env.VOTES.list({ prefix: `vote:${pilier}:`, limit: 1000 })).keys.length;
  }
  return totaux;
}

/** Villes demandées (filet KV), de la plus demandée à la moins demandée. */
async function villesDemandees(env) {
  const { keys } = await env.VOTES.list({ prefix: 'ville:', limit: 1000 });
  const parVille = new Map();
  for (const { name } of keys) {
    const ville = name.split(':')[1] || '';
    parVille.set(ville, (parVille.get(ville) || 0) + 1);
  }
  return [...parVille.entries()]
    .map(([ville, total]) => ({ ville, total }))
    .sort((a, b) => b.total - a.total || a.ville.localeCompare(b.ville));
}

/** Jour courant en UTC (YYYY-MM-DD) : la clé de compteur du jour. */
function jourISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Les compteurs des N derniers jours, du plus ancien au plus récent, plus les
 * totaux et les deux taux qui comptent : combien de tops affichés finissent en
 * sortie gardée, et combien de gardes finissent en compte.
 */
async function mesures(env, jours) {
  const aujourdhui = new Date();
  const lignes = [];
  const totaux = Object.fromEntries(MESURES.map((e) => [e, 0]));

  for (let i = jours - 1; i >= 0; i -= 1) {
    const d = new Date(aujourdhui);
    d.setUTCDate(d.getUTCDate() - i);
    const jour = jourISO(d);
    const ligne = { jour };
    for (const evt of MESURES) {
      const n = Number.parseInt((await env.VOTES.get(`cpt:${jour}:${evt}`)) || '0', 10) || 0;
      ligne[evt] = n;
      totaux[evt] += n;
    }
    lignes.push(ligne);
  }

  const pourcent = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    jours,
    lignes,
    totaux,
    taux: {
      // Un top affiché sur combien débouche sur une sortie gardée ?
      gardeParTop: pourcent(totaux.garde, totaux.top + totaux['top-vide']),
      // Et parmi ceux qui gardent, combien créent un compte ?
      compteParGarde: pourcent(totaux.compte, totaux.garde),
      // Part des tops qui n'ont rien trouvé : la santé des zones ouvertes.
      topVide: pourcent(totaux['top-vide'], totaux.top + totaux['top-vide']),
    },
  };
}

/** Ville normalisée pour servir de préfixe de clé KV : « Saint-Brieuc » → « saint-brieuc ». */
function normaliserVille(ville) {
  return ville
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'inconnue';
}

/**
 * Paramètres de la requête avec défauts Rennes/3 ans. `city` (ou `ville`)
 * remplace ces défauts par la ville de l'app ; une ville inconnue rend
 * `{ villeInconnue }` plutôt que de retomber en silence sur Rennes.
 */
function lireParams(url) {
  // Attention : Number(null) vaut 0 — il faut tester la présence du paramètre
  // avant de convertir, sinon lat/lon absents deviennent (0,0).
  const num = (nom) => {
    const s = url.searchParams.get(nom);
    if (s === null || s.trim() === '') return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  const saisieVille = (url.searchParams.get('city') || url.searchParams.get('ville') || '').trim();
  const ville = saisieVille ? villeParNomOuId(saisieVille) : null;
  if (saisieVille && !ville) return { villeInconnue: saisieVille };
  const base = ville
    ? { lat: ville.lat, lon: ville.lon, departement: ville.dept, codeDepartement: ville.code }
    : DEFAUTS;
  const lat = num('lat') ?? base.lat;
  const lon = num('lon') ?? base.lon;
  // Une position explicite décide aussi du département, sauf dept/code
  // explicites : city=Lorient&lat=<Rennes> interrogeait le Morbihan autour de
  // Rennes, donc un top vide.
  const zone = num('lat') !== null && num('lon') !== null ? villeLaPlusProche(lat, lon) : null;
  const zoneBase = zone ? { departement: zone.dept, codeDepartement: zone.code } : base;
  return {
    ville: ville ? { id: ville.id, nom: ville.nom } : null,
    dateISO: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
      ? url.searchParams.get('date')
      : prochainSamedi(),
    lat,
    lon,
    age: num('age') ?? DEFAUTS.age,
    rayonKm: num('rayon') ?? DEFAUTS.rayonKm,
    departement: url.searchParams.get('dept') || zoneBase.departement,
    codeDepartement: url.searchParams.get('code') || zoneBase.codeDepartement,
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

/**
 * Interroge les sources (ou les données de démo) pour des paramètres lus par
 * `lireParams`. Rend les événements actifs ce jour-là, l'état de chaque
 * source et la météo. Partagé par /top et l'admin.
 */
async function chargerSources(env, p) {
  if (isMock(env)) {
    return { evenements: MOCK_EVENEMENTS, meteo: MOCK_METEO, sources: { mock: { ok: true, count: MOCK_EVENEMENTS.length } } };
  }
  const [oa, dt, med, paris, cirques, meteo] = await Promise.all([
    evenementsOpenAgenda(env, p),
    evenementsDatatourisme(env, p),
    evenementsMediathequesLorient(env, p),
    evenementsParis(env, p),
    evenementsCirques(env, p),
    previsionJour(env, p.lat, p.lon, p.dateISO),
  ]);
  const sources = {};
  sources.openagenda = { ok: oa.ok, count: oa.evenements.length, ...(oa.erreur ? { erreur: oa.erreur } : {}) };
  sources.datatourisme = { ok: dt.ok, count: dt.evenements.length, ...(dt.endpoint ? { endpoint: dt.endpoint } : {}), ...(dt.erreur ? { erreur: dt.erreur } : {}) };
  // Hors de Lorient, la source ne s'interroge pas : on ne l'affiche pas.
  if (!med.horsZone) {
    sources.mediatheques_lorient = {
      ok: med.ok, count: med.evenements.length,
      ...(med.seancesDuJour !== undefined ? { seancesDuJour: med.seancesDuJour } : {}),
      ...(med.erreur ? { erreur: med.erreur } : {}),
    };
  }
  if (!paris.horsZone) {
    sources.paris = { ok: paris.ok, count: paris.evenements.length, ...(paris.erreur ? { erreur: paris.erreur } : {}) };
  }
  sources.cirques = { ok: cirques.ok, count: cirques.evenements.length, ...(cirques.erreur ? { erreur: cirques.erreur } : {}) };
  const evenements = [...oa.evenements, ...dt.evenements, ...med.evenements, ...paris.evenements, ...cirques.evenements]
    .filter((ev) => actifCeJour(ev, p.dateISO));
  return { evenements, meteo, sources };
}

async function calculerTop(request, url, env, surcouche) {
  const p = lireParams(url);
  const { evenements: bruts, meteo, sources } = await chargerSources(env, p);
  const evenements = surcouche ? appliquerSurcouche(bruts, surcouche, p.dateISO) : bruts;

  const resultat = top(evenements, { dateISO: p.dateISO, lat: p.lat, lon: p.lon, age: p.age, rayonKm: p.rayonKm, meteo });
  // Les sorties du top portent leur texte complet (la fiche) ; le scoring
  // n'en a lu que l'extrait (texte.js).
  // Photo d'une sortie proposée : l'app reçoit l'adresse complète.
  const selection = resultat.top.map(pourAffichage)
    .map((ev) => (ev.photo ? { ...ev, photoUrl: `${url.origin}/photos/${ev.photo}` } : ev));
  return {
    mock: isMock(env),
    date: p.dateISO,
    ville: p.ville,
    position: { lat: p.lat, lon: p.lon },
    age: p.age,
    rayonKm: p.rayonKm,
    meteo,
    sources,
    stats: { total: resultat.total, uniques: resultat.uniques, retenus: resultat.retenus },
    preferee: selection[0] || null,
    top: selection,
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
  if (p.villeInconnue) return { error: 'ville_inconnue', ville: p.villeInconnue };
  const [oa, dt, med, paris, cirques, tournees, meteo] = await Promise.all([
    evenementsOpenAgenda(env, p),
    evenementsDatatourisme(env, p),
    evenementsMediathequesLorient(env, p),
    evenementsParis(env, p),
    evenementsCirques(env, p),
    etatTournees(env),
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
  const tous = [...oa.evenements, ...dt.evenements, ...med.evenements, ...paris.evenements, ...cirques.evenements];
  const retenus = top(tous.filter((ev) => actifCeJour(ev, p.dateISO)),
    { dateISO: p.dateISO, lat: p.lat, lon: p.lon, age: p.age, rayonKm: p.rayonKm, meteo }).retenus;

  return {
    mock: false,
    date: p.dateISO,
    departement: p.departement,
    meteo,
    openagenda: { ok: oa.ok, ...(oa.erreur ? { erreur: oa.erreur } : {}), ...bilanOA },
    datatourisme: {
      ok: dt.ok, endpoint: dt.endpoint,
      ...(dt.total !== undefined ? { totalApi: dt.total } : {}),
      ...(dt.erreur ? { erreur: dt.erreur } : {}),
      ...(dt.ok ? analyse(dt.evenements) : {}),
    },
    ...(med.horsZone ? {} : {
      mediatheques_lorient: { ok: med.ok, ...(med.erreur ? { erreur: med.erreur } : {}), ...analyse(med.evenements) },
    }),
    ...(paris.horsZone ? {} : {
      paris: { ok: paris.ok, ...(paris.erreur ? { erreur: paris.erreur } : {}), ...analyse(paris.evenements) },
    }),
    // État de la dernière lecture des sites de cirques (une panne = un site
    // refait, à corriger dans sources/cirques.js).
    cirques: { ok: cirques.ok, ...(cirques.erreur ? { erreur: cirques.erreur } : {}), count: cirques.evenements.length, tournees },
    retenusApresScoring: retenus,
    verdict: retenus >= 10 ? 'GO — densité largement suffisante'
      : retenus >= 3 ? 'LIMITE — ça passe pour un top 5, à re-tester sur plusieurs dates'
        : 'NO-GO sur cette date — re-tester d’autres dates/rayons avant de conclure',
  };
}

/** Cache HTTP (6 h) sur les réponses live — les sources sont lentes.
 *  `?fresh=1` force le recalcul (un redéploiement ne purge pas le cache). */
async function repondreAvecCache(request, env, ctx, calcul, versionSurcouche = 0) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const utilisable = !fresh && !isMock(env) && typeof caches !== 'undefined' && caches.default;
  // Clé versionnée : les entrées d'une version de scoring antérieure ne sont
  // jamais servies (invalidation immédiate au déploiement d'un nouveau scoring).
  const urlCle = new URL(request.url);
  urlCle.searchParams.delete('fresh');
  urlCle.searchParams.set('cv', CACHE_VERSION);
  urlCle.searchParams.set('sv', String(versionSurcouche));
  const cle = new Request(urlCle.toString(), { method: 'GET' });
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

/** Encart HTML des pages du site, en cache 3 h (même clé versionnée que /top). */
const ENCART_TTL = 3 * 3600;
async function servirEncart(request, url, env, ctx) {
  const surcouche = await lireSurcouche(env);
  const cle = new URL(request.url);
  cle.searchParams.delete('fresh');
  cle.searchParams.set('cv', CACHE_VERSION);
  cle.searchParams.set('sv', String(surcouche.version));
  const requeteCle = new Request(cle.toString(), { method: 'GET' });
  const utilisable = url.searchParams.get('fresh') !== '1' && !isMock(env) && typeof caches !== 'undefined' && caches.default;
  if (utilisable) {
    const enCache = await caches.default.match(requeteCle);
    if (enCache) return enCache;
  }
  const r = await calculerEncart(url, env, {
    lireParams, chargerSources, lireSurcouche: async () => surcouche, appliquerSurcouche,
  });
  if (r.statut === 400) return jsonResponse({ error: r.erreur }, 400, request, env);
  const reponse = new Response(r.statut === 200 ? r.html : null, {
    status: r.statut,
    headers: {
      ...(r.statut === 200 ? { 'Content-Type': 'text/html; charset=utf-8' } : {}),
      'Cache-Control': `public, max-age=${ENCART_TTL}`,
      'X-Robots-Tag': 'noindex', // le fragment s'indexe dans la page du site, pas seul
      'Access-Control-Allow-Origin': '*',
    },
  });
  if (utilisable && ctx?.waitUntil) ctx.waitUntil(caches.default.put(requeteCle, reponse.clone()));
  return reponse;
}
