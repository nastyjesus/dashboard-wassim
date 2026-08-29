// Scoring d'un événement pour une sortie donnée (date, position, âge de
// l'enfant, météo). Retourne null si l'événement est exclu (trop loin, âge
// incompatible, signal anti-famille), sinon un objet {score, raisons[]} —
// les raisons alimentent directement l'UI (« À l'abri s'il pleut », « À 12 km »).

import { scoreFamille, trancheAge, lieuType } from './famille.js';
import { jourCompatible, dureeJours } from './jours.js';

const RAYON_DEFAUT_KM = 40;

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
  const famille = scoreFamille(ev);
  if (famille < 0) return null; // signal explicitement anti-famille

  // Récurrent un autre jour (« les dimanches » un samedi) : hors-jeu.
  if (!jourCompatible(ev, ctx.dateISO)) return null;

  const raisons = [];
  let score = famille * 2;
  if (famille >= 2) raisons.push('Pensé pour les enfants');

  // Les vrais événements du jour passent devant les expos/animations
  // permanentes qui « couvrent » toutes les dates. Une animation au long
  // cours (> 90 jours) n'est retenue que si elle est explicitement pensée
  // pour les enfants — sinon les expos d'art « tout public » squattent le
  // top 5 les jours de pluie (constaté sur données réelles).
  const duree = dureeJours(ev);
  if (duree !== null && duree <= 3) { score += 1.5; raisons.push('Événement ponctuel'); }
  if (duree !== null && duree > 90) {
    if (famille < 2) return null;
    score -= 1;
  }

  // Âge : exclusion si l'enfant est trop jeune, bonus si la tranche colle.
  const age = trancheAge(ev);
  if (age) {
    if (ctx.age < age.min) return null;
    if (age.max !== null && ctx.age > age.max) return null;
    score += 2;
    raisons.push(age.max !== null ? `${age.min}-${age.max} ans` : `Dès ${age.min} ans`);
  }

  // Distance : exclusion au-delà du rayon, plus c'est proche mieux c'est.
  let km = null;
  const rayon = ctx.rayonKm || RAYON_DEFAUT_KM;
  if (Number.isFinite(ev.lat) && Number.isFinite(ev.lon)) {
    km = distanceKm(ctx.lat, ctx.lon, ev.lat, ev.lon);
    if (km > rayon) return null;
    score += 2 * (1 - km / rayon);
    raisons.push(`À ${km} km`);
  }

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
    score: Math.round(score * 100) / 100,
    distanceKm: km,
    lieuType: type,
    age: age || null,
    dureeJours: duree,
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

export function top(evenements, ctx, n = 5) {
  const uniques = dedoublonner(evenements);
  const scores = uniques.map((ev) => scorer(ev, ctx)).filter(Boolean);
  scores.sort((a, b) => b.score - a.score);

  // Diversité : jamais plus de 2 animations permanentes dans le top — les
  // événements du jour doivent rester la tête d'affiche.
  const selection = [];
  let permanents = 0;
  for (const ev of scores) {
    const longue = ev.dureeJours !== null && ev.dureeJours > 90;
    if (longue && permanents >= MAX_PERMANENTS_AU_TOP) continue;
    if (longue) permanents += 1;
    selection.push(ev);
    if (selection.length === n) break;
  }

  return {
    total: evenements.length,
    uniques: uniques.length,
    retenus: scores.length,
    top: selection,
  };
}
