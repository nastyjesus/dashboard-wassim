// Surcouche admin — ce que Wassim change à la main par-dessus les agendas.
//
// Les sorties ne sont stockées nulle part : chaque /top interroge les sources
// en direct. Masquer, corriger, épingler ou ajouter une sortie, c'est donc
// poser une consigne que le worker applique à la volée, avant le scoring.
// Tout tient dans une seule clé KV (lue une fois par requête, quelques Ko) :
//
//   adm:surcouche  { version, masques, corrections, epingles, manuels }
//                  chaque section est indexée par la clé d'événement
//   adm:journal    les dernières modifications, avec l'état d'avant (annulable)
//
// Un seul éditeur (Wassim) : pas de gestion de conflit d'écriture.

const CLE_SURCOUCHE = 'adm:surcouche';
const CLE_JOURNAL = 'adm:journal';
const JOURNAL_MAX = 300;
const SECTIONS = ['masques', 'corrections', 'epingles', 'manuels'];

export function surcoucheVide() {
  return { version: 0, masques: {}, corrections: {}, epingles: {}, manuels: {} };
}

/**
 * Clé stable d'un événement : source + identifiant de la source. Sans
 * identifiant (rare), titre + jour — assez stable d'un appel à l'autre.
 */
export function cleEvenement(ev) {
  if (ev.id) return `${ev.origine || 'inconnue'}:${ev.id}`;
  const titre = String(ev.titre || '').toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${ev.origine || 'inconnue'}:${titre}@${ev.dateDebut || ''}`;
}

export async function lireSurcouche(env) {
  if (!env.VOTES) return surcoucheVide();
  try {
    const brut = await env.VOTES.get(CLE_SURCOUCHE);
    if (!brut) return surcoucheVide();
    const s = JSON.parse(brut);
    const vide = surcoucheVide();
    for (const k of SECTIONS) vide[k] = s[k] && typeof s[k] === 'object' ? s[k] : {};
    vide.version = Number(s.version) || 0;
    return vide;
  } catch {
    // Une surcouche illisible ne doit jamais casser /top : on l'ignore.
    return surcoucheVide();
  }
}

export async function lireJournal(env) {
  if (!env.VOTES) return [];
  try {
    const j = JSON.parse((await env.VOTES.get(CLE_JOURNAL)) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Validation des saisies

// billetterie, photo (identifiant d'une photo servie par /photos/<id>) et
// proposePar viennent des propositions d'organisateurs (propositions.js).
const TEXTES = {
  titre: 160, description: 2000, horaires: 160, lieuNom: 120, adresse: 200, ville: 80, url: 500,
  billetterie: 500, photo: 64, proposePar: 120,
};
const URLS = ['url', 'billetterie'];
export const CHAMPS_CORRIGEABLES = [
  ...Object.keys(TEXTES), 'lat', 'lon', 'gratuit', 'dateDebut', 'dateFin', 'ageMin', 'ageMax', 'lieuType',
  'prixEnfant', 'prixAdulte', 'reservation',
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Garde les champs connus, au bon type. Une valeur vide (« », null) veut dire
 * « pas de correction sur ce champ » et disparaît. Renvoie {champs} ou {erreur}.
 */
export function nettoyerChamps(brut) {
  const champs = {};
  for (const [k, v] of Object.entries(brut || {})) {
    if (!CHAMPS_CORRIGEABLES.includes(k) || v === null || v === undefined || v === '') continue;
    if (k in TEXTES) {
      const t = String(v).trim().slice(0, TEXTES[k]);
      if (!t) continue;
      if (URLS.includes(k) && !/^https?:\/\//i.test(t)) return { erreur: `${k} doit commencer par http(s)://` };
      if (k === 'photo' && !/^[a-z0-9-]+$/i.test(t)) return { erreur: 'photo : identifiant invalide' };
      champs[k] = t;
    } else if (k === 'prixEnfant' || k === 'prixAdulte') {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 500) return { erreur: `${k} : un montant entre 0 et 500 €` };
      champs[k] = Math.round(n * 100) / 100;
    } else if (k === 'reservation') {
      champs[k] = v === true || v === 'true' || v === 'oui';
    } else if (k === 'lat' || k === 'lon') {
      const n = Number(v);
      const max = k === 'lat' ? 90 : 180;
      if (!Number.isFinite(n) || Math.abs(n) > max) return { erreur: `${k} invalide` };
      champs[k] = n;
    } else if (k === 'ageMin' || k === 'ageMax') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 18) return { erreur: `${k} : un entier entre 0 et 18` };
      champs[k] = n;
    } else if (k === 'dateDebut' || k === 'dateFin') {
      if (!DATE.test(String(v))) return { erreur: `${k} : format AAAA-MM-JJ` };
      champs[k] = String(v);
    } else if (k === 'gratuit') {
      champs[k] = v === true || v === 'true' || v === 'oui';
    } else if (k === 'lieuType') {
      if (!['interieur', 'exterieur'].includes(v)) return { erreur: 'lieuType : interieur ou exterieur' };
      champs[k] = v;
    }
  }
  if (Number.isFinite(champs.ageMax) && Number.isFinite(champs.ageMin) && champs.ageMax < champs.ageMin) {
    return { erreur: 'ageMax plus petit que ageMin' };
  }
  if (champs.dateDebut && champs.dateFin && champs.dateFin < champs.dateDebut) {
    return { erreur: 'dateFin avant dateDebut' };
  }
  return { champs };
}

/** Une sortie ajoutée à la main : titre, date et position obligatoires. */
export function nettoyerManuel(brut) {
  const { champs, erreur } = nettoyerChamps(brut);
  if (erreur) return { erreur };
  if (!champs.titre) return { erreur: 'titre obligatoire' };
  if (!champs.dateDebut) return { erreur: 'dateDebut obligatoire' };
  if (!Number.isFinite(champs.lat) || !Number.isFinite(champs.lon)) return { erreur: 'position (lat/lon) obligatoire' };
  const jours = Array.isArray(brut.jours)
    ? [...new Set(brut.jours.map(Number).filter((j) => Number.isInteger(j) && j >= 0 && j <= 6))].sort()
    : [];
  // Séances précises (propositions d'organisateurs) : « AAAA-MM-JJTHH:MM »,
  // au format des créneaux OpenAgenda que lit le scoring horaire.
  const SEANCE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const creneaux = Array.isArray(brut.creneaux)
    ? brut.creneaux
      .filter((c) => c && SEANCE.test(c.debut || ''))
      .slice(0, 60)
      .map((c) => ({ debut: c.debut, fin: SEANCE.test(c.fin || '') && c.fin > c.debut ? c.fin : null }))
    : [];
  // Dates précises (événement joué certains jours seulement) : la plage seule
  // le proposerait tous les jours du premier au dernier.
  const dates = Array.isArray(brut.dates)
    ? [...new Set(brut.dates.map(String).filter((d) => DATE.test(d)))].sort().slice(0, 60)
    : [];
  return {
    manuel: {
      ...champs,
      dateFin: champs.dateFin || champs.dateDebut,
      jours, // vide = tous les jours de la plage
      ...(dates.length ? { dates } : {}),
      ...(creneaux.length ? { creneaux } : {}),
      villeId: brut.villeId ? String(brut.villeId).slice(0, 40) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Application à la volée

/** Une sortie manuelle a-t-elle lieu ce jour-là (plage + jours de la semaine) ? */
export function manuelActif(m, dateISO) {
  if (!m.dateDebut || dateISO < m.dateDebut || dateISO > (m.dateFin || m.dateDebut)) return false;
  if (m.dates && m.dates.length) return m.dates.includes(dateISO);
  if (!m.jours || !m.jours.length) return true;
  return m.jours.includes(new Date(`${dateISO}T12:00:00Z`).getUTCDay());
}

/** Une sortie manuelle au format interne commun aux sources. */
export function evenementManuel(cle, m) {
  return {
    origine: 'manuel',
    source: null,
    majLe: null,
    id: cle.slice('manuel:'.length),
    titre: m.titre,
    description: m.description || '',
    motsCles: [],
    dateDebut: m.dateDebut,
    dateFin: m.dateFin || m.dateDebut,
    horaires: m.horaires || null,
    creneaux: m.creneaux || [],
    lieuNom: m.lieuNom || null,
    adresse: m.adresse || null,
    ville: m.ville || null,
    lat: m.lat,
    lon: m.lon,
    url: m.url || null,
    gratuit: m.gratuit ?? null,
    ...(Number.isFinite(m.ageMin) ? { ageMin: m.ageMin } : {}),
    ...(Number.isFinite(m.ageMax) ? { ageMax: m.ageMax } : {}),
    ...(m.lieuType ? { lieuType: m.lieuType } : {}),
    ...(Number.isFinite(m.prixEnfant) ? { prixEnfant: m.prixEnfant } : {}),
    ...(Number.isFinite(m.prixAdulte) ? { prixAdulte: m.prixAdulte } : {}),
    ...(m.reservation ? { reservation: true } : {}),
    ...(m.billetterie ? { billetterie: m.billetterie } : {}),
    ...(m.photo ? { photo: m.photo } : {}),
    ...(m.proposePar ? { proposePar: m.proposePar } : {}),
    force: true,
  };
}

/**
 * Applique la surcouche aux événements du jour.
 * - Sorties manuelles du jour ajoutées EN TÊTE (elles gagnent le dédoublonnage
 *   face à la même sortie venue d'un agenda) ;
 * - corrections fusionnées champ par champ ;
 * - épinglées marquées (`epingle`, `force`) ;
 * - masquées retirées, sauf `{ garderMasques: true }` (vue admin) où elles
 *   restent avec `masque: true`.
 * Chaque événement rendu porte sa clé (`cle`).
 */
export function appliquerSurcouche(evenements, s, dateISO, { garderMasques = false } = {}) {
  const manuels = Object.entries(s.manuels || {})
    .filter(([, m]) => manuelActif(m, dateISO))
    .map(([cle, m]) => evenementManuel(cle, m));
  const resultat = [];
  for (const brut of [...manuels, ...evenements]) {
    const cle = cleEvenement(brut);
    const masque = Boolean(s.masques?.[cle]);
    if (masque && !garderMasques) continue;
    const correction = s.corrections?.[cle];
    const ev = { ...brut, ...(correction ? correction.champs : {}), cle };
    // Les créneaux structurés de la source priment sur le texte : un horaire
    // corrigé à la main doit les remplacer, sinon il ne s'afficherait jamais.
    if (correction?.champs.horaires) ev.creneaux = [];
    // Même chose pour la description : le texte complet de la source (renvoyé
    // à la fiche, voir texte.js) ne doit pas masquer une description corrigée.
    if (correction?.champs.description) delete ev.descriptionComplete;
    if (masque) ev.masque = true;
    if (correction) ev.corrige = Object.keys(correction.champs);
    if (s.epingles?.[cle]) { ev.epingle = true; ev.force = true; }
    resultat.push(ev);
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Actions de l'admin

const SECTION_PAR_ACTION = {
  masquer: 'masques', reafficher: 'masques',
  corriger: 'corrections',
  epingler: 'epingles', desepingler: 'epingles',
  'enregistrer-manuel': 'manuels', 'supprimer-manuel': 'manuels',
};

/**
 * Applique une action à la surcouche, sans effet de bord. Renvoie la nouvelle
 * surcouche et l'entrée de journal (avec l'état d'avant, pour annuler), ou
 * {erreur}.
 */
export function appliquerAction(s, action, maintenant = new Date(), journal = []) {
  const le = maintenant.toISOString();
  const titre = action.titre ? String(action.titre).slice(0, 160) : null;

  if (action.type === 'annuler') {
    const entree = journal.find((e) => e.id === action.journalId);
    if (!entree) return { erreur: 'entrée de journal introuvable' };
    if (entree.type === 'annuler') return { erreur: 'une annulation ne s’annule pas — refais l’action' };
    return poser(s, entree.section, entree.cle, entree.avant, {
      type: 'annuler', titre: entree.titre, le, annule: entree.id,
    });
  }

  const section = SECTION_PAR_ACTION[action.type];
  if (!section) return { erreur: 'action inconnue' };

  let cle = action.cle ? String(action.cle).slice(0, 300) : '';
  let valeur;
  switch (action.type) {
    case 'masquer':
      valeur = { le, titre, raison: action.raison ? String(action.raison).slice(0, 200) : null };
      break;
    case 'epingler':
      valeur = { le, titre };
      break;
    case 'reafficher':
    case 'desepingler':
    case 'supprimer-manuel':
      valeur = null;
      break;
    case 'corriger': {
      const { champs, erreur } = nettoyerChamps(action.champs);
      if (erreur) return { erreur };
      valeur = Object.keys(champs).length ? { le, titre, champs } : null;
      break;
    }
    case 'enregistrer-manuel': {
      const { manuel, erreur } = nettoyerManuel(action.manuel || {});
      if (erreur) return { erreur };
      if (!cle) cle = `manuel:${crypto.randomUUID()}`;
      if (!cle.startsWith('manuel:')) return { erreur: 'clé de sortie manuelle invalide' };
      valeur = { ...manuel, le };
      break;
    }
    default:
      return { erreur: 'action inconnue' };
  }
  if (!cle) return { erreur: 'clé manquante' };
  return poser(s, section, cle, valeur, { type: action.type, titre: titre || valeur?.titre || null, le });
}

function poser(s, section, cle, valeur, meta) {
  const avant = s[section]?.[cle] ?? null;
  const suivante = { ...s, [section]: { ...s[section] }, version: (s.version || 0) + 1 };
  if (valeur === null) delete suivante[section][cle];
  else suivante[section][cle] = valeur;
  const entree = {
    id: `${meta.le}-${crypto.randomUUID().slice(0, 8)}`,
    ...meta,
    section,
    cle,
    avant,
    apres: valeur,
  };
  return { surcouche: suivante, entree };
}

/** Lit, applique, écrit (surcouche + journal). Renvoie la même forme qu'appliquerAction. */
export async function executerAction(env, action) {
  const [s, journal] = await Promise.all([lireSurcouche(env), lireJournal(env)]);
  const r = appliquerAction(s, action, new Date(), journal);
  if (r.erreur) return r;
  await env.VOTES.put(CLE_SURCOUCHE, JSON.stringify(r.surcouche));
  await env.VOTES.put(CLE_JOURNAL, JSON.stringify([r.entree, ...journal].slice(0, JOURNAL_MAX)));
  return r;
}
