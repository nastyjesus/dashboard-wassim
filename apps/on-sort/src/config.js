// Configuration de l'app — worker + villes proposées à l'onboarding.
// Zone de lancement : la Bretagne (4 départements). Chaque ville porte son
// département : le worker filtre OpenAgenda par nom de département.

export const WORKER_URL = 'https://on-sort-poc.loumiwassim.workers.dev';

export const RAYON_KM = 40;

/** Points de départ proposés (Bretagne). */
export const VILLES = [
  { id: 'rennes', nom: 'Rennes', lat: 48.1173, lon: -1.6778, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'bruz', nom: 'Bruz', lat: 48.024, lon: -1.745, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'stmalo', nom: 'Saint-Malo', lat: 48.649, lon: -2.026, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'vitre', nom: 'Vitré', lat: 48.124, lon: -1.21, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'stbrieuc', nom: 'Saint-Brieuc', lat: 48.514, lon: -2.765, dept: "Côtes-d'Armor", code: '22' },
  { id: 'vannes', nom: 'Vannes', lat: 47.658, lon: -2.76, dept: 'Morbihan', code: '56' },
  { id: 'lorient', nom: 'Lorient', lat: 47.748, lon: -3.366, dept: 'Morbihan', code: '56' },
  { id: 'brest', nom: 'Brest', lat: 48.39, lon: -4.486, dept: 'Finistère', code: '29' },
  { id: 'quimper', nom: 'Quimper', lat: 47.996, lon: -4.102, dept: 'Finistère', code: '29' },
];

export const AGES = [1, 2, 3, 4, 5, 6, 7, 8];
