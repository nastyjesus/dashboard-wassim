// Source principale du POC : miroir OpenDataSoft des événements publics
// OpenAgenda (dataset `evenements-publics-openagenda`), API Explore v2.1,
// sans clé. Les médiathèques, mairies et MJC y publient beaucoup d'ateliers
// enfants — exactement la matière première de l'app.
//
// On sur-collecte côté API (département + fenêtre de dates larges) et on
// affine en code : le format des champs varie selon les contributeurs, le
// parsing est volontairement tolérant.

const LIMITE = 100; // max autorisé par requête sur l'API Explore
const PAGES_MAX = 3; // jusqu'à 300 événements analysés par appel

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
  const where = [
    `location_department=${odsql(departement)}`,
    `firstdate_begin<=date'${dateISO}'`,
    `lastdate_end>=date'${dateISO}'`,
  ].join(' AND ');
  // Pagination : le département dépasse largement les 100 événements par
  // requête — on collecte jusqu'à PAGES_MAX pages pour élargir le vivier.
  const evenements = [];
  try {
    for (let page = 0; page < PAGES_MAX; page++) {
      const url = `${base}?where=${encodeURIComponent(where)}&limit=${LIMITE}`
        + `&offset=${page * LIMITE}&order_by=firstdate_begin`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        if (page === 0) return { ok: false, evenements: [], erreur: `HTTP ${res.status}` };
        break; // les pages déjà collectées restent exploitables
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

/** Passe un enregistrement ODS au format interne commun aux sources. */
function normaliser(r) {
  if (!r || !(r.title_fr || r.title)) return null;
  const coords = r.location_coordinates || {};
  return {
    source: 'openagenda',
    id: r.uid ? String(r.uid) : null,
    titre: r.title_fr || r.title,
    description: texteBrut([r.description_fr, r.longdescription_fr].filter(Boolean).join(' ')).slice(0, 1200),
    motsCles: Array.isArray(r.keywords_fr) ? r.keywords_fr : [],
    dateDebut: (r.firstdate_begin || '').slice(0, 10) || null,
    dateFin: (r.lastdate_end || '').slice(0, 10) || null,
    horaires: r.daterange_fr || null,
    lieuNom: r.location_name || null,
    adresse: [r.location_address, r.location_postalcode, r.location_city].filter(Boolean).join(', ') || null,
    ville: r.location_city || null,
    lat: typeof coords.lat === 'number' ? coords.lat : null,
    lon: typeof coords.lon === 'number' ? coords.lon : null,
    url: r.canonicalurl || null,
    gratuit: /gratuit|libre/i.test(r.conditions_fr || '') || null,
  };
}
