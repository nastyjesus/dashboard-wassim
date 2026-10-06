// Source : les tournées des grands cirques, lues sur leurs sites officiels.
//
// Pourquoi (6 octobre 2026) : un cirque de passage est LA sortie
// exceptionnelle qu'un papa ne veut pas rater, et les agendas open data ne
// la portent presque jamais (le cirque est commercial). Les trois sites
// ci-dessous publient leurs dates en HTML statique, sans flux ni API :
//  - Pinder   : blocs « jet-posts__item » — ville (h4), dates, lieu ;
//  - Gruss    : liens « tournee-item » — ville, « 8 oct. - 11 oct. » (année
//               absente sauf au changement d'année : on la déduit) ;
//  - Medrano  : titres h2 « Du 10 octobre au 22 novembre 2026 » puis la ville.
//
// Lecture une fois par jour (cron, voir index.js), stockage en KV : /top ne
// parse jamais de HTML (limite CPU du plan gratuit). Les villes sont
// géocodées une fois (Open-Meteo geocoding) et gardées en KV.
//
// Un site qui ne rend plus aucune date est signalé (statut par site dans la
// clé KV, lu par l'admin et /diagnostic) : c'est presque toujours une
// refonte du site, pas une tournée vide.

import { distanceKm } from '../scoring.js';

const CLE_KV = 'cirques:tournees';
const CLE_GEO = 'cirques:geo:';
const UA = 'Mozilla/5.0 (compatible; papa-parfait/1.0; +https://papa-parfait-web.loumiwassim.workers.dev)';
// « Dès le 9 décembre » sans date de fin : on ne l'annonce que 30 jours.
const JOURS_SANS_FIN = 30;

const MOIS = {
  janv: 1, janvier: 1, fevr: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6,
  juil: 7, juillet: 7, aout: 8, sept: 9, septembre: 9, oct: 10, octobre: 10,
  nov: 11, novembre: 11, dec: 12, decembre: 12,
};

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

function texte(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mois(mot) {
  return MOIS[sansAccents(mot).toLowerCase().replace(/\.$/, '')] || null;
}

const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

const PARTICULES = new Set(['de', 'du', 'des', 'sur', 'sous', 'les', 'la', 'le', 'en', 'lès', 'et', 'aux']);

/**
 * Nom de commune à la française : « LE MANS » → « Le Mans », « Aix les
 * bains » → « Aix-les-Bains », « Villeneuve D'Ascq » → « Villeneuve-d'Ascq ».
 * Seul l'article de tête garde son espace (Le Mans, La Rochelle).
 */
export function villeLisible(v) {
  const mots = texte(v).toLowerCase().split(/[\s-]+/).filter(Boolean);
  const maj = (m) => m.replace(/^(d')?(\p{L})/u, (x, d, l) => (d || '') + l.toUpperCase());
  const article = mots.length > 1 && ['le', 'la', 'les'].includes(mots[0]) ? `${maj(mots.shift())} ` : '';
  return article + mots.map((m, i) => (i > 0 && (PARTICULES.has(m) || m.startsWith("d'")) ? m.replace(/^(d')(\p{L})/u, (x, d, l) => d + l.toUpperCase()) : maj(m))).join('-');
}

/**
 * Plage de dates en français. `anneeRef` sert quand l'année manque.
 *  « du 02 Octobre au 04 Octobre 2026 », « du 09 au 11 Octobre 2026 »,
 *  « du 17 Octobre 2026 au 1er Novembre 2026 », « 18 déc. - 24 janv. 2027 »,
 *  « Du 10 octobre au 22 novembre 2026 », « Dès le 9 décembre 2026 ».
 * @returns {{debut: string, fin: string|null}|null}
 */
export function plage(brut, anneeRef) {
  const t = sansAccents(texte(brut)).toLowerCase().replace(/1er/g, '1');
  const date = String.raw`(\d{1,2})\s*([a-z]+\.?)?\s*(\d{4})?`;
  const m = t.match(new RegExp(`${date}\\s*(?:au|-|–)\\s*${date}`));
  if (m) {
    const [, j1, m1, a1, j2, m2, a2] = m;
    const moisFin = mois(m2);
    const moisDebut = m1 ? mois(m1) : moisFin;
    if (!moisDebut || !moisFin) return null;
    const anFin = Number(a2) || Number(a1) || anneeRef;
    // Sans année au début : celle de la fin, moins un si l'on change d'année.
    const anDebut = Number(a1) || (moisDebut > moisFin ? anFin - 1 : anFin);
    return { debut: iso(anDebut, moisDebut, j1), fin: iso(anFin, moisFin, j2) };
  }
  const seul = t.match(new RegExp(`(?:des|a partir du|a partir de)\\s*(?:le\\s*)?${date}`));
  if (seul && mois(seul[2])) {
    return { debut: iso(Number(seul[3]) || anneeRef, mois(seul[2]), seul[1]), fin: null };
  }
  return null;
}

/**
 * Gruss n'écrit l'année qu'au changement d'année (« 18 déc. - 24 janv. 2027 »).
 * Les dates sont dans l'ordre de la tournée : on avance l'année quand le mois
 * recule, en partant de l'année courante.
 */
function datesGruss(liste, anneeDepart) {
  let annee = anneeDepart;
  let dernierMois = 0;
  return liste.map((brut) => {
    const explicite = brut.match(/(\d{4})/);
    const premierMois = mois((sansAccents(brut).toLowerCase().match(/\d{1,2}\s*([a-z]+\.?)/) || [])[1] || '');
    if (!explicite && premierMois && premierMois < dernierMois) annee += 1;
    const p = plage(brut, annee);
    if (p) {
      annee = Number(p.fin.slice(0, 4));
      dernierMois = Number(p.fin.slice(5, 7));
    }
    return p;
  });
}

export function parserPinder(html) {
  const blocs = String(html).split('jet-posts__item"').slice(1);
  return blocs.map((b) => {
    const ville = (b.match(/class="entry-title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    const dates = (b.match(/item-intervalle_date[\s\S]*?item-value">([\s\S]*?)<\/div>/) || [])[1];
    const lieu = (b.match(/item-lieu[\s\S]*?item-value">([\s\S]*?)<\/div>/) || [])[1];
    const url = (b.match(/href="([^"]+)"/) || [])[1];
    const p = dates && plage(dates, new Date().getUTCFullYear());
    return ville && p ? { cirque: 'Cirque Pinder', ville: villeLisible(ville), lieu: lieu ? texte(lieu) : null, ...p, url: url || null } : null;
  }).filter(Boolean);
}

export function parserGruss(html, anneeDepart = new Date().getUTCFullYear()) {
  const items = [...String(html).matchAll(/<a href="([^"]+)" class="tournee-item"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    url: m[1],
    ville: texte((m[2].match(/tournee-item-city">([\s\S]*?)<\/span>/) || [])[1]),
    dates: texte((m[2].match(/tournee-item-dates">([\s\S]*?)<\/span>/) || [])[1]),
  }));
  const plages = datesGruss(items.map((i) => i.dates), anneeDepart);
  return items.map((i, k) => (i.ville && plages[k]
    ? { cirque: 'Cirque Arlette Gruss', ville: villeLisible(i.ville), lieu: null, ...plages[k], url: i.url }
    : null)).filter(Boolean);
}

export function parserMedrano(html) {
  // Les h2 se suivent : une date, puis la ville (avec ou sans lien vers sa
  // page), puis le lieu en gras (« Quai Perrache – La Confluence »).
  const h = String(html);
  const titres = [...h.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => ({
    txt: texte(m[1]), url: (m[1].match(/href="([^"]+)"/) || [])[1] || null, fin: m.index + m[0].length,
  }));
  const res = [];
  for (let k = 0; k < titres.length - 1; k++) {
    const date = sansAccents(titres[k].txt).toLowerCase();
    const p = /^(du |des |a partir)/.test(date) && plage(titres[k].txt, new Date().getUTCFullYear());
    const ville = titres[k + 1];
    if (!p || !ville.txt || /\d/.test(ville.txt) || ville.txt.length > 40) continue;
    const apres = h.slice(ville.fin, titres[k + 2] ? titres[k + 2].fin : ville.fin + 3000);
    const lieu = (apres.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1];
    res.push({
      cirque: 'Cirque Medrano', ville: villeLisible(ville.txt), lieu: lieu ? texte(lieu) : null,
      ...p, url: ville.url || 'https://www.cirquemedrano.fr/dates-et-villes/',
    });
  }
  return res;
}

export const SITES = [
  { id: 'pinder', url: 'https://www.cirquepinder.com/dates-villes/', parser: parserPinder },
  { id: 'gruss', url: 'https://www.cirque-gruss.com/la-tournee', parser: parserGruss },
  { id: 'medrano', url: 'https://www.cirquemedrano.fr/dates-et-villes/', parser: parserMedrano },
];

/** Coordonnées d'une ville française (Open-Meteo geocoding), gardées en KV. */
async function geocoder(env, ville) {
  const cle = CLE_GEO + sansAccents(ville).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const connu = await env.VOTES.get(cle, 'json');
  if (connu) return connu;
  // Le géocodeur veut les traits d'union : « Villeneuve D'Ascq » ne donne
  // rien, « Villeneuve-D'Ascq » si (constaté le 6 octobre 2026).
  let r = null;
  for (const nom of new Set([ville, ville.trim().replace(/\s+/g, '-')])) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=1&language=fr&countryCode=FR`;
    const res = await fetch(url);
    if (!res.ok) return null;
    r = (await res.json())?.results?.[0];
    if (r) break;
  }
  if (!r) return null;
  const geo = { lat: r.latitude, lon: r.longitude };
  await env.VOTES.put(cle, JSON.stringify(geo));
  return geo;
}

/**
 * Lit les trois sites, l'un après l'autre (rafales parallèles = 1102 sur le
 * plan gratuit), géocode les villes et range le tout en KV. Appelé par le cron.
 * Un site en panne garde ses dates de la veille.
 */
export async function actualiserTournees(env) {
  if (!env.VOTES) return { ok: false, erreur: 'kv_not_bound' };
  const precedent = (await env.VOTES.get(CLE_KV, 'json')) || { dates: [], sites: {} };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dates = [];
  const sites = {};
  for (const site of SITES) {
    let trouvees = [];
    try {
      const res = await fetch(site.url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      trouvees = site.parser(await res.text());
      if (!trouvees.length) throw new Error('aucune_date');
      sites[site.id] = { ok: true, dates: trouvees.length, le: aujourdhui };
    } catch (e) {
      const anciennes = precedent.dates.filter((d) => d.site === site.id);
      sites[site.id] = { ok: false, erreur: String(e.message || e), le: aujourdhui, gardees: anciennes.length };
      dates.push(...anciennes);
      continue;
    }
    for (const d of trouvees) {
      if ((d.fin || d.debut) < aujourdhui) continue; // déjà parti
      const geo = await geocoder(env, d.ville);
      if (geo) dates.push({ ...d, ...geo, site: site.id, majLe: aujourdhui });
    }
  }
  const resume = { le: aujourdhui, sites, dates };
  await env.VOTES.put(CLE_KV, JSON.stringify(resume));
  return { ok: true, sites, dates: dates.length };
}

/** État des sites (admin, /diagnostic) : dernière lecture et pannes. */
export async function etatTournees(env) {
  const kv = env.VOTES ? await env.VOTES.get(CLE_KV, 'json') : null;
  return kv ? { le: kv.le, sites: kv.sites, dates: kv.dates.length } : { le: null, sites: {}, dates: 0 };
}

const plusJours = (dateISO, n) => {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Passe une date de tournée au format commun des sources. */
export function normaliser(d) {
  const fin = d.fin || plusJours(d.debut, JOURS_SANS_FIN);
  return {
    origine: 'cirques',
    source: `${d.cirque} (site officiel)`,
    majLe: d.majLe || null,
    id: `${d.site}:${d.ville}:${d.debut}`,
    titre: `${d.cirque} à ${d.ville}`,
    description: `Le ${d.cirque} pose son chapiteau à ${d.ville}${d.lieu ? ` (${d.lieu})` : ''}`
      + `${d.fin ? '' : ', à partir de cette date'}. Spectacle de cirque tout public :`
      + ' horaires des représentations et billets sur le site du cirque.',
    motsCles: ['cirque'],
    types: ['CircusEvent'],
    dateDebut: d.debut,
    dateFin: fin,
    horaires: null,
    creneaux: [],
    lieuNom: d.lieu || `Chapiteau du ${d.cirque}`,
    adresse: d.lieu ? `${d.lieu}, ${d.ville}` : d.ville,
    ville: d.ville,
    lat: d.lat,
    lon: d.lon,
    url: d.url || null,
    gratuit: null,
    lieuType: 'interieur', // sous chapiteau
  };
}

/**
 * Cirques présents le jour demandé dans le rayon (lecture KV seule).
 * @returns {Promise<{ok: boolean, evenements: object[], erreur?: string}>}
 */
export async function evenementsCirques(env, { lat, lon, rayonKm, dateISO }) {
  if (!env.VOTES) return { ok: false, evenements: [], erreur: 'kv_not_bound' };
  try {
    const kv = await env.VOTES.get(CLE_KV, 'json');
    if (!kv) return { ok: false, evenements: [], erreur: 'jamais_lu' };
    const evenements = kv.dates
      .map(normaliser)
      .filter((ev) => ev.dateDebut <= dateISO && dateISO <= ev.dateFin)
      .filter((ev) => distanceKm(lat, lon, ev.lat, ev.lon) <= (rayonKm || 40));
    return { ok: true, evenements };
  } catch (e) {
    return { ok: false, evenements: [], erreur: String(e.message || e) };
  }
}
