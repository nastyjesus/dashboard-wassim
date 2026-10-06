// Source : « Que faire à Paris », l'agenda de la Ville de Paris en open data
// (opendata.paris.fr, dataset `que-faire-a-paris-`, API Explore v2.1, sans clé).
//
// Pourquoi (6 octobre 2026) : l'OpenAgenda parisien est pauvre en sorties
// famille — 12 retenues sur 564 événements un samedi. Ici, 320 événements
// étiquetés enfants le même jour (bibliothèques, Fête des rues aux enfants,
// crèches ouvertes le samedi, Paris sport familles…), avec des séances
// exactes (`occurrences`) et un âge structuré (`audience`).
//
// Licence ODbL : réutilisation commerciale permise, en citant la source —
// d'où `source`/`majLe`, affichés par l'app (apps/on-sort/src/mention.js).
//
// Forme relevée le 6 octobre 2026 :
//  - occurrences : « 2026-10-10T10:30:00+02:00_2026-10-10T11:00:00+02:00;… »
//    (heure locale, fiable) ; date_start/date_end décalés d'une heure, on n'en
//    garde que le jour ;
//  - audience : « Public enfants. A partir de 3 ans. Jusqu'à 6 ans. » (un
//    « A partir de -1 ans » existe) ;
//  - qfap_tags : « Enfants;Théâtre » ; lat_lon : {lat, lon} ou null.

import { distanceKm } from '../scoring.js';

const BASE_DEFAUT = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records';
const CENTRE = { lat: 48.8566, lon: 2.3522 };
// Paris intra-muros tient dans 6 km autour du centre.
const MARGE_KM = 6;
const LIMITE = 100;
// Une page (100) : Paris cumule déjà OpenAgenda et DATAtourisme (~580
// événements) et le plan gratuit coupe au-delà de ~10 ms de CPU. Les 100
// plus récents suffisent : mesuré le 6 octobre 2026, le top du samedi 10 est
// identique à celui obtenu avec 200 (deux cirques, ateliers parents-enfants),
// pour un surcoût CPU du scoring parisien de ~17 % au lieu de ~35 %.
const PAGES_MAX = 1;
const SOURCE = 'Que faire à Paris (Ville de Paris)';

const CHAMPS = [
  'id', 'url', 'title', 'lead_text', 'description', 'date_start', 'date_end', 'occurrences',
  'date_description', 'address_name', 'address_street', 'address_zipcode', 'address_city',
  'lat_lon', 'price_type', 'audience', 'qfap_tags', 'event_indoor', 'updated_at',
].join(',');

function texteBrut(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** « début_fin;début_fin » → [{debut, fin}] (format des créneaux OpenAgenda). */
export function creneaux(occurrences) {
  return String(occurrences || '').split(';')
    .map((o) => o.trim().split('_'))
    .filter(([debut]) => /^\d{4}-\d{2}-\d{2}T/.test(debut || ''))
    .map(([debut, fin]) => ({ debut, fin: fin && /^\d{4}-\d{2}-\d{2}T/.test(fin) ? fin : null }));
}

/** Tranche d'âge de `audience`, ou null si aucun âge n'est donné. */
export function ageAudience(audience) {
  const t = String(audience || '');
  const min = t.match(/a partir de (-?\d{1,2}) ans/i);
  const max = t.match(/jusqu.{1,2}[àa] (\d{1,2}) ans/i);
  if (!min && !max) return null;
  return { min: min ? Math.max(0, Number(min[1])) : 0, max: max ? Number(max[1]) : null };
}

export function normaliser(r) {
  if (!r || !r.title) return null;
  const age = ageAudience(r.audience);
  const coords = r.lat_lon || {};
  const localite = [r.address_zipcode, r.address_city].filter(Boolean).join(' ');
  return {
    origine: 'paris',
    source: SOURCE,
    majLe: (r.updated_at || '').slice(0, 10) || null,
    id: r.id ? String(r.id) : null,
    titre: texteBrut(r.title),
    // Le public (« Public tout-petits. ») juste après le chapeau : c'est lui
    // que lisent les heuristiques famille quand aucun âge n'est donné. Pas en
    // tête : le début de description signe les séries (scoring.js), et deux
    // sorties différentes y partageraient « Public tout-petits et enfants… ».
    description: texteBrut([r.lead_text, r.audience, r.description].filter(Boolean).join(' ')).slice(0, 1200),
    motsCles: String(r.qfap_tags || '').split(';').map((s) => s.trim()).filter(Boolean),
    dateDebut: (r.date_start || '').slice(0, 10) || null,
    dateFin: (r.date_end || '').slice(0, 10) || null,
    horaires: texteBrut(r.date_description) || null,
    creneaux: creneaux(r.occurrences),
    lieuNom: r.address_name || null,
    adresse: [r.address_street, localite].filter(Boolean).join(', ') || null,
    ville: r.address_city || null,
    lat: typeof coords.lat === 'number' ? coords.lat : null,
    lon: typeof coords.lon === 'number' ? coords.lon : null,
    url: r.url || null,
    gratuit: r.price_type === 'gratuit' || null,
    ...(age ? { ageMin: age.min, ageMax: age.max } : {}),
    ...(r.event_indoor === 1 ? { lieuType: 'interieur' } : {}),
  };
}

/**
 * Sorties enfants actives le jour demandé, si Paris est dans le rayon.
 * @returns {Promise<{ok: boolean, evenements: object[], horsZone?: boolean, erreur?: string}>}
 */
export async function evenementsParis(env, { lat, lon, rayonKm, dateISO }) {
  if (distanceKm(lat, lon, CENTRE.lat, CENTRE.lon) > (rayonKm || 40) + MARGE_KM) {
    return { ok: true, evenements: [], horsZone: true };
  }
  const where = [
    `date_start<=date'${dateISO}'`,
    `date_end>=date'${dateISO}'`,
    '(qfap_tags like "Enfants" OR audience like "enfants" OR audience like "tout-petits")',
  ].join(' AND ');
  const evenements = [];
  try {
    for (let page = 0; page < PAGES_MAX; page++) {
      // Du plus récent au plus ancien : le ponctuel du jour d'abord (même
      // leçon qu'OpenAgenda, voir openagenda.js).
      const url = `${env.PARIS_BASE || BASE_DEFAUT}?where=${encodeURIComponent(where)}`
        + `&select=${CHAMPS}&order_by=${encodeURIComponent('date_start desc')}`
        + `&limit=${LIMITE}&offset=${page * LIMITE}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        if (page === 0) return { ok: false, evenements: [], erreur: `HTTP ${res.status}` };
        break;
      }
      const data = await res.json();
      const resultats = Array.isArray(data.results) ? data.results : [];
      evenements.push(...resultats.map(normaliser).filter(Boolean));
      if (resultats.length < LIMITE) break;
    }
    return { ok: true, evenements };
  } catch (e) {
    if (evenements.length) return { ok: true, evenements };
    return { ok: false, evenements: [], erreur: String(e.message || e) };
  }
}
