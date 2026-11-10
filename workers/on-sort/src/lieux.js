// Lieux permanents — les valeurs sûres qui complètent le top.
//
// Les agendas ne listent que des événements datés. Un mercredi de novembre,
// Bruz en retient un ou deux de bons : le top restait court, ou se remplissait
// de fonds de tiroir (constat du 10 novembre 2026). Or la sortie d'un petit,
// c'est souvent un parc, une ferme, une ludothèque — ouverts toute l'année et
// absents des agendas.
//
// Ces lieux sont choisis et vérifiés à la main (src/lieux-data.js) : rien
// n'est deviné par mots-clés. Ils ne prennent jamais la place d'un bon
// événement du jour : deux au plus dans le top, davantage seulement s'il n'y
// a rien d'autre à proposer (voir `selectionner` dans scoring.js).

import { distanceKm, bonusDistance } from './scoring.js';

/** Base d'un lieu : un parc proche fait 5,5 à 7,5 — sous un événement adapté
 *  et proche (7,5 à 12), au niveau d'une sortie moyenne. Réglé sur le top de
 *  Bruz : à 3, deux parcs sortaient un spectacle 3-6 ans du top.
 */
const BASE_LIEU = 1.5;
/** Rotation : un petit plus qui change chaque jour et pour chaque lieu, pour
 *  que le top ne propose pas toujours les deux mêmes parcs. */
const ROTATION_MAX = 1;

/** Nombre stable entre 0 et 1 tiré d'un texte (FNV-1a) — pas d'aléa : le même
 *  jour rend le même top, cache compris. */
function fraction(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** « MM-JJ » dans la saison ? Gère une saison à cheval sur l'hiver. */
function enSaison(saison, dateISO) {
  if (!saison || !dateISO) return true;
  const jour = dateISO.slice(5);
  return saison.debut <= saison.fin
    ? saison.debut <= jour && jour <= saison.fin
    : jour >= saison.debut || jour <= saison.fin;
}

/**
 * Note un lieu pour une sortie donnée. Null s'il ne convient pas ce jour-là
 * (trop loin, fermé, hors saison, dehors sous la pluie, âge).
 * Rend la même forme qu'un événement noté par `scorer`.
 * @param {object} lieu voir src/lieux-data.js
 * @param {{lat: number, lon: number, age: number, rayonKm: number, dateISO?: string, meteo?: object|null}} ctx
 */
export function noterLieu(lieu, ctx) {
  const km = distanceKm(ctx.lat, ctx.lon, lieu.lat, lieu.lon);
  if (km > ctx.rayonKm) return null;
  if (Number.isFinite(lieu.ageMin) && ctx.age < lieu.ageMin) return null;
  if (Number.isFinite(lieu.ageMax) && ctx.age > lieu.ageMax) return null;
  if (!enSaison(lieu.saison, ctx.dateISO)) return null;
  if (ctx.dateISO && (lieu.fermeJours || []).includes(new Date(`${ctx.dateISO}T12:00:00Z`).getUTCDay())) return null;
  const pluie = Boolean(ctx.meteo?.pluie);
  if (pluie && lieu.lieuType === 'exterieur') return null;

  const raisons = ['Valeur sûre'];
  let score = BASE_LIEU;
  const age = Number.isFinite(lieu.ageMin) || Number.isFinite(lieu.ageMax)
    ? { min: lieu.ageMin ?? 0, max: Number.isFinite(lieu.ageMax) ? lieu.ageMax : null }
    : null;
  if (age) {
    score += 1;
    raisons.push(age.max !== null ? `${age.min}-${age.max} ans` : `Dès ${age.min} ans`);
  }
  const d = bonusDistance(km);
  score += d.points;
  if (d.raison) raisons.push(d.raison);
  raisons.push(`À ${km} km`);
  if (ctx.meteo) {
    if (pluie && lieu.lieuType === 'interieur') { score += 2; raisons.push('À l’abri s’il pleut'); }
    if (!pluie && lieu.lieuType === 'exterieur') { score += 1; raisons.push('Profite du beau temps'); }
  }
  if (lieu.gratuit === true) { score += 1; raisons.push('Gratuit'); }
  score += fraction(`${ctx.dateISO || ''}|${lieu.id}`) * ROTATION_MAX;

  return {
    origine: 'lieux',
    id: lieu.id,
    cle: `lieux:${lieu.id}`,
    titre: lieu.titre,
    description: lieu.description,
    motsCles: [],
    dateDebut: null,
    dateFin: null,
    // Pas d'horaires recopiés : ils changent avec les saisons, et une heure
    // fausse est pire que pas d'heure. La fiche renvoie au site du lieu.
    horaires: 'Horaires sur le site du lieu',
    lieuNom: null,
    adresse: lieu.adresse || null,
    ville: lieu.ville || null,
    lat: lieu.lat,
    lon: lieu.lon,
    url: lieu.url || null,
    gratuit: lieu.gratuit ?? null,
    permanent: true,
    score: Math.round(score * 100) / 100,
    distanceKm: km,
    lieuType: lieu.lieuType,
    age,
    dureeJours: null,
    genre: 'lieu',
    raisons,
  };
}

/** Les lieux qui conviennent ce jour-là, notés. */
export function lieuxDuJour(lieux, ctx) {
  return lieux.map((l) => noterLieu(l, ctx)).filter(Boolean);
}
