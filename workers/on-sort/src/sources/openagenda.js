// Source principale du POC : miroir OpenDataSoft des événements publics
// OpenAgenda (dataset `evenements-publics-openagenda`), API Explore v2.1,
// sans clé. Les médiathèques, mairies et MJC y publient beaucoup d'ateliers
// enfants — exactement la matière première de l'app.
//
// On sur-collecte côté API (département + fenêtre de dates larges) et on
// affine en code : le format des champs varie selon les contributeurs, le
// parsing est volontairement tolérant.

import { assembler, champsDescription } from '../texte.js';
const LIMITE = 100; // max autorisé par requête sur l'API Explore
// 400 événements analysés au plus par appel (limite CPU du plan gratuit),
// répartis en deux lots — voir `evenementsOpenAgenda`. Les récents prennent
// jusqu'à 3 pages ; les animations au long cours ont ce qui reste, au moins
// une page (Paris : 116 récents, 275 au long cours dont le Palais des enfants).
const PAGES_TOTAL = 4;
const PAGES_RECENTS_MAX = 3;
// Un événement « récent » a commencé dans les RECENT_JOURS jours précédant la
// date demandée (ou ce jour-là). Les autres sont des animations au long cours.
const RECENT_JOURS = 60;

/** Échappe une valeur pour un littéral de chaîne ODSQL. */
function odsql(valeur) {
  return `"${String(valeur).replace(/"/g, '\\"')}"`;
}

/**
 * Récupère les événements d'un département actifs à la date demandée.
 * @param {{ODS_BASE?: string}} env
 * @param {{departement: string, dateISO: string, joursFenetre?: number}} params
 *   departement : nom ODS (« Ille-et-Vilaine »), dateISO : YYYY-MM-DD.
 * @returns {Promise<{ok: boolean, evenements: object[], erreur?: string}>}
 */
export async function evenementsOpenAgenda(env, { departement, dateISO }) {
  const base = env.ODS_BASE
    || 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records';
  // Événements dont la plage [première date, dernière date] couvre le jour
  // demandé. Le filtrage fin (occurrence réelle ce jour-là) reste en JS.
  const couvre = [
    `location_department=${odsql(departement)}`,
    `firstdate_begin<=date'${dateISO}'`,
    `lastdate_end>=date'${dateISO}'`,
  ];
  const limite = dateMoinsJours(dateISO, RECENT_JOURS);
  // Deux lots. Avant le 6 octobre 2026, un seul tri par date de début
  // croissante, coupé à 300 : à Paris, les 300 places partaient à des séries
  // démarrées en 2020-2021 et tout ce qui commençait après le 15 septembre
  // était invisible — les ponctuels du jour (cirque, fête, spectacle) d'abord.
  //  1. les récents, du plus récent au plus ancien : l'événement du jour passe
  //     en tête ;
  //  2. les animations au long cours (musées, espaces enfants), au moins une
  //     page, elles aussi de la plus récente à la plus ancienne : une série
  //     ouverte en 2020 est le plus souvent abandonnée. Trier par mise à jour
  //     ne marche pas — les grosses institutions rafraîchissent tout chaque
  //     jour, et le Palais des enfants tombait 269e sur 275.
  const recents = await lireLot(base, [...couvre, `firstdate_begin>=date'${limite}'`].join(' AND '),
    'firstdate_begin desc', PAGES_RECENTS_MAX);
  const anciens = await lireLot(base, [...couvre, `firstdate_begin<date'${limite}'`].join(' AND '),
    'firstdate_begin desc', Math.max(1, PAGES_TOTAL - recents.pages));
  const evenements = [...recents.evenements, ...anciens.evenements];
  const erreur = recents.erreur || anciens.erreur;
  // Un lot en panne n'efface pas l'autre ; panne déclarée si rien n'est lu.
  if (!evenements.length && erreur) return { ok: false, evenements: [], erreur };
  return { ok: true, evenements };
}

/**
 * Lit jusqu'à `pagesMax` pages d'une requête ; les pages déjà lues restent
 * acquises. `pages` : le nombre de requêtes faites (budget du lot suivant).
 */
async function lireLot(base, where, ordre, pagesMax) {
  const evenements = [];
  let pages = 0;
  try {
    while (pages < pagesMax) {
      const url = `${base}?where=${encodeURIComponent(where)}&limit=${LIMITE}`
        + `&offset=${pages * LIMITE}&order_by=${encodeURIComponent(ordre)}`;
      pages += 1;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return { evenements, pages, erreur: `HTTP ${res.status}` };
      const data = await res.json();
      const resultats = Array.isArray(data.results) ? data.results : [];
      evenements.push(...resultats.map(normaliser).filter(Boolean));
      if (resultats.length < LIMITE) break;
    }
    return { evenements, pages, erreur: null };
  } catch (e) {
    return { evenements, pages, erreur: String(e.message || e) };
  }
}

/** YYYY-MM-DD moins n jours (calcul en UTC, sans dérive de fuseau). */
function dateMoinsJours(dateISO, n) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Les descriptions arrivent avec du HTML et des entités : on nettoie. */
function texteBrut(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `timings` : la liste exacte des créneaux, livrée en chaîne JSON
 * ('[{"begin":"2026-09-18T09:30:00+02:00","end":"…"}]'). Tolérant : chaîne
 * ou tableau, entrée absente ou mal formée → [].
 */
function creneaux(timings) {
  let liste = timings;
  if (typeof liste === 'string') {
    try { liste = JSON.parse(liste); } catch { return []; }
  }
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((t) => t && typeof t.begin === 'string')
    .map((t) => ({ debut: t.begin, fin: typeof t.end === 'string' ? t.end : null }));
}

/**
 * « Rue des Boires, Nantes » + « 44200 » + « Nantes » → « Rue des Boires, 44200 Nantes ».
 * Les contributeurs mettent souvent déjà la ville dans l'adresse : on ne la
 * répète pas, et le code postal se colle à la ville comme sur une enveloppe.
 */
export function adresseLisible(adresse, codePostal, ville) {
  let rue = (adresse || '').trim().replace(/[,\s]+$/, '');
  const v = (ville || '').trim();
  const cp = (codePostal || '').trim();
  if (v) {
    const villeEnFin = new RegExp(`[,\\s]*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    rue = rue.replace(villeEnFin, '');
  }
  const localite = [cp, v].filter(Boolean).join(' ');
  return [rue, localite].filter(Boolean).join(', ') || null;
}

/** Passe un enregistrement ODS au format interne commun aux sources. */
function normaliser(r) {
  if (!r || !(r.title_fr || r.title)) return null;
  const coords = r.location_coordinates || {};
  return {
    origine: 'openagenda',
    // `source`/`majLe` : mention de la Licence Ouverte DATAtourisme, à
    // afficher seulement pour cette source. Rien à citer ici.
    source: null,
    majLe: null,
    id: r.uid ? String(r.uid) : null,
    titre: texteBrut(r.title_fr || r.title), // certains titres contiennent des sauts de ligne
    // Paragraphes gardés, chapeau non répété, coupe en fin de phrase (texte.js).
    ...champsDescription(assembler(r.description_fr, r.longdescription_fr)),
    motsCles: Array.isArray(r.keywords_fr) ? r.keywords_fr : [],
    dateDebut: (r.firstdate_begin || '').slice(0, 10) || null,
    dateFin: (r.lastdate_end || '').slice(0, 10) || null,
    horaires: r.daterange_fr || null,
    creneaux: creneaux(r.timings),
    lieuNom: r.location_name || null,
    adresse: adresseLisible(r.location_address, r.location_postalcode, r.location_city),
    ville: r.location_city || null,
    lat: typeof coords.lat === 'number' ? coords.lat : null,
    lon: typeof coords.lon === 'number' ? coords.lon : null,
    url: r.canonicalurl || null,
    gratuit: /gratuit|libre/i.test(r.conditions_fr || '') || null,
  };
}
