// Scoring d'un événement pour une sortie donnée (date, position, âge de
// l'enfant, météo). Retourne null si l'événement est exclu (trop loin, âge
// incompatible, signal anti-famille), sinon un objet {score, raisons[]} —
// les raisons alimentent directement l'UI (« À l'abri s'il pleut », « À 12 km »).

import { analyseFamille, trancheAge, lieuType } from './famille.js';
import { jourCompatible, dureeJours } from './jours.js';
import { verdictHoraire, libelleHoraires } from './horaires.js';
import { exceptionnel, estLecture } from './genre.js';

const RAYON_DEFAUT_KM = 40;

/**
 * Exceptionnel (cirque de passage, fête foraine, carnaval…) : un bonus qui
 * doit pouvoir battre une séance de lecture bien notée (voir genre.js).
 * Au-delà de EXCEPTIONNEL_JOURS_MAX, ce n'est plus « de passage » (festival
 * étalé sur une saison) : pas de bonus.
 * Cirque, manèges, carnaval, feu d'artifice, Noël (genres « enfant ») pèsent
 * plus : ils ne donnent presque jamais d'âge ni de « jeune public », et
 * plafonnaient à 10 points derrière n'importe quel spectacle à 12,5 — le
 * Cirque Pinder à Paris sortait du top 5 (constaté le 6 octobre 2026).
 */
const BONUS_EXCEPTIONNEL = 3;
const BONUS_EXCEPTIONNEL_ENFANT = 5;
const EXCEPTIONNEL_JOURS_MAX = 45;
/** Lecture/conte : la routine des médiathèques, légèrement en retrait. */
const MALUS_LECTURE = 1.5;

/**
 * Distance : paliers francs plutôt qu'une pente douce. Sur données réelles,
 * un atelier à 39 km gagnait le GO devant un équivalent à 10 km parce que la
 * pente (2 points étalés sur 40 km) pesait moins que le bonus « ponctuel ».
 * Au-delà de 30 km, c'est un malus : c'est encore proposé, mais ça ne
 * décide plus pour le papa.
 */
function bonusDistance(km) {
  if (km <= 12) return { points: 3, raison: 'Tout près' }; // ~10 min de voiture
  if (km <= 20) return { points: 2, raison: null };
  if (km <= 30) return { points: 0.5, raison: null };
  return { points: -1.5, raison: null };
}

/** Distance haversine en km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/**
 * @param {object} ev — événement normalisé (voir sources/*.js)
 * @param {{lat: number, lon: number, age: number, rayonKm?: number, meteo?: object|null}} ctx
 */
export function scorer(ev, ctx) {
  const r = evaluer(ev, ctx);
  return r.exclu ? null : r;
}

/**
 * Comme `scorer`, mais dit pourquoi un événement est écarté : `{exclu: motif}`
 * au lieu de null. Sert l'admin (« pourquoi cette sortie n'apparaît pas ? »).
 * `ev.force` (sortie ajoutée ou épinglée à la main) passe les filtres de
 * contenu — on sait que c'est une sortie enfant — mais pas ceux de jour, d'âge
 * ni de distance, qui dépendent du papa.
 */
export function evaluer(ev, ctx) {
  const force = ev.force === true;
  const analyse = analyseFamille(ev);
  const { specifique } = analyse;
  if (analyse.score < 0 && !force) return { exclu: 'anti-famille' }; // signal explicitement anti-famille
  // Un cirque ou des manèges n'ont pas besoin d'écrire « en famille » pour
  // être une sortie d'enfant : le genre vaut un public nommé (« Ouvert aux
  // enfants », pas « Pensé pour » — rien ne le prouve pour un tout-petit).
  const ex = exceptionnel(ev);
  const famille = ex?.enfant ? Math.max(analyse.score, 2) : analyse.score;

  // Récurrent un autre jour (« les dimanches » un samedi) : hors-jeu.
  if (!jourCompatible(ev, ctx.dateISO)) return { exclu: 'jour-incompatible' };

  // Exiger un vrai signal « sortie enfant » : au moins un mot-clé famille
  // (faible ou fort) OU une tranche d'âge enfant détectée. Sans ça, des
  // événements neutres/pro (job dating, recrutement, réunions) squattaient le
  // top uniquement par proximité — constaté sur données réelles.
  // Bar : un mot-clé fort, OU deux mots faibles (famille >= 1), OU une tranche
  // d'âge enfant. Un seul mot faible (ex. « atelier » d'un atelier bien-être
  // adulte) ne suffit pas — trop de faux positifs pro/adultes sinon.
  const age = trancheAge(ev);
  const signalEnfant = famille >= 1 || (age && age.min <= 12);
  if (!signalEnfant && !force) return { exclu: 'pas-de-signal-enfant' };

  const raisons = [];
  let score = Math.max(famille, 0) * 2;
  // L'étiquette dit ce qu'on sait vraiment : « pensé pour » quand un mot
  // spécifique (jeune public, marionnettes, bébé…) ou un âge le prouve ;
  // « ouvert aux enfants » quand le texte nomme seulement un public familial.
  if (famille >= 2) raisons.push(specifique || age ? 'Pensé pour les enfants' : 'Ouvert aux enfants');

  // Les vrais événements du jour passent devant les expos/animations
  // permanentes qui « couvrent » toutes les dates. Une animation au long
  // cours (> 90 jours) n'est retenue que si elle est explicitement pensée
  // pour les enfants — sinon les expos d'art « tout public » squattent le
  // top 5 les jours de pluie (constaté sur données réelles).
  const duree = dureeJours(ev);
  if (duree !== null && duree <= 3) { score += 1.5; raisons.push('Événement ponctuel'); }
  if (duree !== null && duree > 90) {
    if (famille < 2 && !force) return { exclu: 'permanent-non-enfant' };
    score -= 1;
  }

  // Genre : l'exceptionnel de passage devant, la lecture un cran derrière.
  const lecture = !ex && estLecture(ev);
  // Un cirque de la tournée officielle (sources/cirques.js) est de passage
  // même s'il reste deux mois : Pinder passe tout l'hiver à Paris.
  const dePassage = duree === null || duree <= EXCEPTIONNEL_JOURS_MAX || ev.origine === 'cirques';
  if (ex && dePassage) {
    score += ex.enfant ? BONUS_EXCEPTIONNEL_ENFANT : BONUS_EXCEPTIONNEL;
    raisons.push('À ne pas rater');
  }
  if (lecture) score -= MALUS_LECTURE;

  // Âge : exclusion si l'enfant est trop jeune, bonus si la tranche colle.
  if (age) {
    if (ctx.age < age.min) return { exclu: 'trop-jeune' };
    if (age.max !== null && ctx.age > age.max) return { exclu: 'trop-grand' };
    score += 2;
    raisons.push(age.max !== null ? `${age.min}-${age.max} ans` : `Dès ${age.min} ans`);
  }

  // Distance : exclusion au-delà du rayon, paliers francs en deçà.
  let km = null;
  const rayon = ctx.rayonKm || RAYON_DEFAUT_KM;
  if (Number.isFinite(ev.lat) && Number.isFinite(ev.lon)) {
    km = distanceKm(ctx.lat, ctx.lon, ev.lat, ev.lon);
    if (km > rayon) return { exclu: 'hors-rayon', distanceKm: km };
    const d = bonusDistance(km);
    score += d.points;
    if (d.raison) raisons.push(d.raison);
    raisons.push(`À ${km} km`);
  }

  // Heure : en semaine (lun/mar/jeu/ven), l'enfant est gardé et le papa au
  // travail. Un créneau en pleine journée reste proposé mais ne gagne plus le
  // GO ; un créneau après 16h30 est au contraire ce qu'on cherche.
  const horaire = verdictHoraire(ev, ctx.dateISO);
  if (horaire === 'journee') score -= 3;
  if (horaire === 'soir') { score += 1; raisons.push('Après l’école'); }
  // Tout commence à 19h30 ou plus tard : c'est l'heure du bain, pas d'une
  // sortie avec un petit (chorales à 20h, cours à 19h30 vus dans le corpus).
  if (horaire === 'tard') score -= 3;

  // Météo : s'il pleut, on privilégie l'intérieur ; s'il fait beau, le dehors.
  const type = lieuType(ev);
  if (ctx.meteo) {
    if (ctx.meteo.pluie) {
      if (type === 'interieur') { score += 2; raisons.push('À l’abri s’il pleut'); }
      if (type === 'exterieur') score -= 3;
    } else if (type === 'exterieur') {
      score += 1;
      raisons.push('Profite du beau temps');
    }
  }

  if (/gratuit|entrée libre|entree libre/i.test(`${ev.titre} ${ev.description}`)) {
    score += 1;
    raisons.push('Gratuit');
  }

  return {
    ...ev,
    // Horaires lisibles du jour (« 09h30 et 10h15 ») ; texte brut en secours.
    horaires: libelleHoraires(ev, ctx.dateISO) || ev.horaires || null,
    score: Math.round(score * 100) / 100,
    distanceKm: km,
    lieuType: type,
    age: age || null,
    dureeJours: duree,
    genre: ex ? ex.genre : (lecture ? 'lecture' : 'autre'),
    raisons,
  };
}

/** Dédoublonne (même titre normalisé + même jour) — les sources se recoupent. */
export function dedoublonner(evenements) {
  const vus = new Map();
  for (const ev of evenements) {
    const cle = `${(ev.titre || '').toLowerCase().replace(/\W+/g, ' ').trim()}|${ev.dateDebut || ''}`;
    if (!vus.has(cle)) vus.set(cle, ev);
  }
  return [...vus.values()];
}

/**
 * Pipeline complet : dédoublonnage, scoring, tri, top N.
 * Retourne aussi les comptages bruts pour le diagnostic.
 */
const MAX_PERMANENTS_AU_TOP = 2;
/** Une seule lecture/conte par top — les autres seulement pour compléter. */
const MAX_LECTURES_AU_TOP = 1;
/** Début de description qui signe une série (même texte, lieu différent). */
const SERIE_CARACTERES = 80;

/**
 * Clé de série : le début normalisé de la description. Les déclinaisons
 * d'un même rendez-vous (un parc, une crèche, une bibliothèque différente)
 * partagent leur texte et ne diffèrent qu'après. Null si la description est
 * trop courte pour signer quoi que ce soit.
 */
export function cleSerie(ev) {
  const d = (ev.description || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return d.length >= SERIE_CARACTERES ? d.slice(0, SERIE_CARACTERES) : null;
}

export function top(evenements, ctx, n = 5) {
  const uniques = dedoublonner(evenements);
  const scores = uniques.map((ev) => scorer(ev, ctx)).filter(Boolean);
  return {
    total: evenements.length,
    uniques: uniques.length,
    retenus: scores.length,
    top: selectionner(scores, n),
  };
}

/**
 * Le classement à partir d'événements déjà scorés (sortie de `scorer`).
 * Séparé de `top` pour que l'admin, qui score déjà tout pour afficher le
 * détail, ne paie pas le scoring deux fois (limite CPU du plan gratuit).
 */
export function selectionner(scoresBruts, n = 5) {
  const scores = [...scoresBruts];
  // Épinglées à la main (admin) d'abord, puis par score.
  scores.sort((a, b) => (b.epingle === true) - (a.epingle === true) || b.score - a.score);

  // Diversité : jamais plus de 2 animations permanentes dans le top — les
  // événements du jour doivent rester la tête d'affiche. Une épinglée passe.
  // Même logique pour la lecture : une par top, sinon une médiathèque
  // active remplit les cinq places (« Historiettes », « Les samedis à
  // histoires »… constaté à Rennes le 6 octobre 2026). Les lectures écartées
  // complètent seulement un top qui n'a rien d'autre à proposer.
  // Et une seule sortie par série : « Dimanches sportifs JARDIN BOTANIQUE »,
  // « … JARDIN PUBLIC », « … PARC BORDELAIS » prenaient quatre places du top
  // de Bordeaux (6 octobre 2026) — même texte, seul le parc change.
  const selection = [];
  const enReserve = [];
  const series = new Set();
  let permanents = 0;
  let lectures = 0;
  for (const ev of scores) {
    const longue = !ev.epingle && ev.dureeJours !== null && ev.dureeJours > 90;
    if (longue && permanents >= MAX_PERMANENTS_AU_TOP) continue;
    const lecture = !ev.epingle && ev.genre === 'lecture';
    const serie = ev.epingle ? null : cleSerie(ev);
    if ((lecture && lectures >= MAX_LECTURES_AU_TOP) || (serie && series.has(serie))) { enReserve.push(ev); continue; }
    if (longue) permanents += 1;
    if (lecture) lectures += 1;
    if (serie) series.add(serie);
    selection.push(ev);
    if (selection.length === n) break;
  }
  for (const ev of enReserve) {
    if (selection.length === n) break;
    selection.push(ev);
  }
  return selection;
}
