// Configuration de l'app — worker + villes proposées à l'onboarding.

export const WORKER_URL = 'https://on-sort-poc.loumiwassim.workers.dev';

export const RAYON_KM = 40;

/** Points de départ proposés (Ille-et-Vilaine, POC). */
export const VILLES = [
  { id: 'rennes', nom: 'Rennes', lat: 48.1173, lon: -1.6778 },
  { id: 'bruz', nom: 'Bruz', lat: 48.024, lon: -1.745 },
  { id: 'cesson', nom: 'Cesson-Sévigné', lat: 48.121, lon: -1.603 },
  { id: 'betton', nom: 'Betton', lat: 48.18, lon: -1.64 },
  { id: 'chartres', nom: 'Chartres-de-Bretagne', lat: 48.04, lon: -1.702 },
  { id: 'stmalo', nom: 'Saint-Malo', lat: 48.649, lon: -2.026 },
  { id: 'vitre', nom: 'Vitré', lat: 48.124, lon: -1.21 },
  { id: 'redon', nom: 'Redon', lat: 47.652, lon: -2.084 },
];

export const AGES = [1, 2, 3, 4, 5, 6, 7, 8];
