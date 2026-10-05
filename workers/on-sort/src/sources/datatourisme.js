// Source DATAtourisme — API v1 (https://api.datatourisme.fr/v1/docs).
//
// Clé gratuite, nominative, en secret wrangler : DATATOURISME_API_KEY (jamais
// dans le code ni dans wrangler.toml). Sans clé, la source se déclare en panne
// proprement et le top tourne sur OpenAgenda seul.
//
// Une requête = les fêtes et manifestations (/entertainmentAndEvent) actives
// le jour demandé, dans le rayon autour de la position. Quota : 1 000 req/h —
// d'où un plafond de pages (le cache de /top fait le reste).
//
// Forme réelle vérifiée le 5 octobre 2026 : libellés multilingues
// {"@fr": …}, `takesPlaceAt` = liste de périodes {startDate, endDate,
// startTime, endTime}, `isLocatedAt[0].geo` / `.address[0]`,
// `hasBeenCreatedBy.legalName`, `lastUpdate` (YYYY-MM-DD).

const BASE_DEFAUT = 'https://api.datatourisme.fr/v1/entertainmentAndEvent';
const PAGE_SIZE = 100; // maximum de l'API
const PAGES_MAX = 3; // 300 fiches : Lorient en compte ~130 un samedi, Rennes ~40
const CHAMPS = [
  'uuid', 'uri', 'label', 'hasDescription', 'type', 'takesPlaceAt',
  'isLocatedAt.geo', 'isLocatedAt.address', 'hasContact.homepage',
  'hasBeenCreatedBy.legalName', 'lastUpdate',
].join(',');

/** Premier champ défini parmi plusieurs noms possibles. */
function champ(obj, ...noms) {
  for (const n of noms) {
    if (obj?.[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
  }
  return null;
}

/** Texte d'une valeur DATAtourisme : chaîne, tableau, ou objet multilingue {"@fr": …}. */
function texte(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim() || null;
  if (Array.isArray(v)) return v.map(texte).find(Boolean) || null;
  if (typeof v === 'object') {
    return texte(v['@fr'] ?? v.fr ?? v['@value'] ?? v.value ?? Object.values(v)[0]);
  }
  return null;
}

/**
 * Créateur de la donnée (`hasBeenCreatedBy`) — la Licence Ouverte de
 * DATAtourisme impose de le citer, avec la date de mise à jour, sur chaque
 * sortie affichée. Sans nom lisible, on cite au moins DATAtourisme : une
 * mention vide ne serait pas conforme.
 */
function createur(r) {
  const c = [].concat(champ(r, 'hasBeenCreatedBy') || [])[0];
  const nom = c && typeof c === 'object'
    ? texte(champ(c, 'legalName', 'schema:legalName', 'name', 'label'))
    : texte(c);
  return nom || 'DATAtourisme';
}

/** Date de mise à jour de la fiche, en YYYY-MM-DD (null si absente). */
function dateMaj(r) {
  const d = texte(champ(r, 'lastUpdate', 'lastUpdateDatatourisme'));
  return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

/**
 * Bornes de l'événement : la période qui couvre le jour demandé si elle
 * existe (une fiche récurrente en a des dizaines), sinon l'enveloppe de
 * toutes les périodes.
 */
function periode(r, dateISO) {
  const periodes = [].concat(r.takesPlaceAt || [])
    .map((p) => ({ debut: (p.startDate || '').slice(0, 10), fin: (p.endDate || p.startDate || '').slice(0, 10), heure: p.startTime, heureFin: p.endTime }))
    .filter((p) => p.debut);
  if (!periodes.length) return { debut: null, fin: null, creneaux: [], horsJour: false };
  // Rendez-vous hebdomadaire codé en plages : plusieurs périodes qui
  // commencent et finissent toutes le même jour de la semaine (constaté le
  // 5 octobre 2026 : « Lecture offerte aux enfants », 18 plages de mercredi à
  // mercredi, affichée un samedi avec « 10h, 10h et 10h »). Elle n'a lieu que
  // ce jour-là, pas tous les jours de la plage.
  const jour = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  const jours = new Set(periodes.flatMap((p) => [jour(p.debut), jour(p.fin)]));
  const hebdo = periodes.length > 1 && jours.size === 1 && periodes.some((p) => p.fin > p.debut);
  const horsJour = hebdo && jour(dateISO) !== [...jours][0];
  const duJour = horsJour ? [] : periodes.filter((p) => p.debut <= dateISO && dateISO <= p.fin);
  // Créneaux au format d'OpenAgenda ({debut, fin} ISO local) : le scoring
  // horaire (« après l'école », « trop tard ») les lit tels quels. Une même
  // séance répétée dans plusieurs plages ne compte qu'une fois.
  const vus = new Set();
  const creneaux = duJour
    .filter((p) => /^\d{2}:\d{2}/.test(p.heure || ''))
    .map((p) => ({
      debut: `${dateISO}T${p.heure.slice(0, 5)}`,
      fin: /^\d{2}:\d{2}/.test(p.heureFin || '') && p.heureFin.slice(0, 5) > p.heure.slice(0, 5)
        ? `${dateISO}T${p.heureFin.slice(0, 5)}` : null,
    }))
    .filter((c) => (vus.has(c.debut) ? false : vus.add(c.debut)))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  if (horsJour) return { debut: null, fin: null, creneaux: [], horsJour: true };
  if (duJour.length) {
    return { debut: duJour[0].debut, fin: duJour.reduce((m, p) => (p.fin > m ? p.fin : m), duJour[0].fin), creneaux, horsJour: false };
  }
  return {
    debut: periodes.reduce((m, p) => (p.debut < m ? p.debut : m), periodes[0].debut),
    fin: periodes.reduce((m, p) => (p.fin > m ? p.fin : m), periodes[0].fin),
    creneaux,
    horsJour: false,
  };
}

/** « 3 Rue de Kervidanou, Eden Bowl » + « 29300 » + « Quimperlé ». */
function adresse(a) {
  if (!a) return null;
  const rue = [].concat(a.streetAddress || []).filter(Boolean).join(', ');
  const localite = [a.postalCode, a.addressLocality].filter(Boolean).join(' ');
  return [rue, localite].filter(Boolean).join(', ') || null;
}

export function normaliser(r, dateISO) {
  const titre = texte(r?.label);
  if (!titre) return null;
  const lieu = [].concat(r.isLocatedAt || [])[0] || {};
  const adr = [].concat(lieu.address || [])[0] || null;
  const geo = lieu.geo || {};
  const lat = Number(geo.latitude);
  const lon = Number(geo.longitude);
  const desc = [].concat(r.hasDescription || [])[0] || {};
  const p = periode(r, dateISO);
  if (p.horsJour) return null; // rendez-vous hebdomadaire d'un autre jour
  return {
    origine: 'datatourisme',
    source: createur(r),
    majLe: dateMaj(r),
    id: r.uuid || null,
    titre,
    description: String(texte(desc.description) || texte(desc.shortDescription) || '').slice(0, 1200),
    // Les types (« ChildrensEvent », « ShowEvent »…) ne parlent pas
    // français : ils ne servent pas aux heuristiques famille, qui lisent le
    // texte. On ne les met pas en mots-clés pour ne rien fausser.
    motsCles: [],
    dateDebut: p.debut,
    dateFin: p.fin,
    horaires: null,
    creneaux: p.creneaux,
    lieuNom: null,
    adresse: adresse(adr),
    ville: adr?.addressLocality || null,
    lat: Number.isFinite(lat) && geo.latitude !== undefined ? lat : null,
    lon: Number.isFinite(lon) && geo.longitude !== undefined ? lon : null,
    url: texte([].concat(r.hasContact || []).map((c) => c?.homepage)) || r.uri || null,
    gratuit: null,
  };
}

/**
 * Fêtes et manifestations actives le jour demandé, dans le rayon.
 * @param {{DATATOURISME_API_KEY?: string, DATATOURISME_BASE?: string}} env
 * @param {{lat: number, lon: number, rayonKm: number, dateISO: string}} params
 * @returns {Promise<{ok: boolean, evenements: object[], endpoint?: string, total?: number, erreur?: string}>}
 */
export async function evenementsDatatourisme(env, { lat, lon, rayonKm, dateISO }) {
  const base = env.DATATOURISME_BASE || BASE_DEFAUT;
  if (!env.DATATOURISME_API_KEY) return { ok: false, evenements: [], endpoint: base, erreur: 'cle_absente' };

  const params = new URLSearchParams({
    geo_distance: `${lat},${lon},${rayonKm || 40}km`,
    filters: `takesPlaceAt.startDate[lte]=${dateISO} AND takesPlaceAt.endDate[gte]=${dateISO}`,
    fields: CHAMPS,
    lang: 'fr',
    page_size: String(PAGE_SIZE),
  });
  const evenements = [];
  let total;
  try {
    for (let page = 1; page <= PAGES_MAX; page++) {
      params.set('page', String(page));
      const res = await fetch(`${base}?${params}`, {
        headers: { Accept: 'application/json', 'X-API-Key': env.DATATOURISME_API_KEY },
      });
      if (!res.ok) {
        // Pages déjà lues gardées : un 429 en page 3 ne doit pas tout perdre.
        return { ok: evenements.length > 0, evenements, endpoint: base, total, erreur: `HTTP ${res.status}` };
      }
      const data = await res.json();
      total = data?.meta?.total;
      const objets = Array.isArray(data?.objects) ? data.objects : [];
      evenements.push(...objets.map((r) => normaliser(r, dateISO)).filter(Boolean));
      if (!data?.meta?.next || objets.length < PAGE_SIZE) break;
    }
  } catch (e) {
    return { ok: evenements.length > 0, evenements, endpoint: base, total, erreur: String(e.message || e) };
  }
  return { ok: true, evenements, endpoint: base, total };
}
