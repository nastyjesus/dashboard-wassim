// Villes ouvertes — copie de `apps/on-sort/src/config.js`.
//
// Pourquoi une copie : l'alerte du week-end tourne côté worker, sans l'app, et
// a besoin des coordonnées pour demander le top d'un papa. Les deux listes
// doivent rester identiques — à mettre à jour ensemble à chaque ouverture de
// zone. Le test `alerte.test.js` compte les villes pour qu'un oubli se voie.
// Relevée le 24 septembre 2026 : 18 villes, 8 départements.

export const VILLES = [
  // Bretagne
  { id: 'rennes', nom: 'Rennes', lat: 48.1173, lon: -1.6778, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'bruz', nom: 'Bruz', lat: 48.024, lon: -1.745, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'stmalo', nom: 'Saint-Malo', lat: 48.649, lon: -2.026, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'vitre', nom: 'Vitré', lat: 48.124, lon: -1.21, dept: 'Ille-et-Vilaine', code: '35' },
  { id: 'stbrieuc', nom: 'Saint-Brieuc', lat: 48.514, lon: -2.765, dept: "Côtes-d'Armor", code: '22' },
  { id: 'vannes', nom: 'Vannes', lat: 47.658, lon: -2.76, dept: 'Morbihan', code: '56' },
  { id: 'lorient', nom: 'Lorient', lat: 47.748, lon: -3.366, dept: 'Morbihan', code: '56' },
  { id: 'brest', nom: 'Brest', lat: 48.39, lon: -4.486, dept: 'Finistère', code: '29' },
  { id: 'quimper', nom: 'Quimper', lat: 47.996, lon: -4.102, dept: 'Finistère', code: '29' },
  // Loire-Atlantique
  { id: 'nantes', nom: 'Nantes', lat: 47.2172, lon: -1.5534, dept: 'Loire-Atlantique', code: '44' },
  { id: 'stnazaire', nom: 'Saint-Nazaire', lat: 47.2751, lon: -2.2179, dept: 'Loire-Atlantique', code: '44' },
  // Paris
  { id: 'paris', nom: 'Paris', lat: 48.8534, lon: 2.3488, dept: 'Paris', code: '75' },
  // Nord
  { id: 'lille', nom: 'Lille', lat: 50.6339, lon: 3.0551, dept: 'Nord', code: '59' },
  { id: 'valenciennes', nom: 'Valenciennes', lat: 50.3591, lon: 3.5251, dept: 'Nord', code: '59' },
  { id: 'dunkerque', nom: 'Dunkerque', lat: 51.0344, lon: 2.3768, dept: 'Nord', code: '59' },
  // Gironde
  { id: 'bordeaux', nom: 'Bordeaux', lat: 44.8412, lon: -0.5805, dept: 'Gironde', code: '33' },
  { id: 'libourne', nom: 'Libourne', lat: 44.9145, lon: -0.2419, dept: 'Gironde', code: '33' },
  { id: 'arcachon', nom: 'Arcachon', lat: 44.6613, lon: -1.1725, dept: 'Gironde', code: '33' },
];

/** Ville par identifiant, ou null si l'identifiant est inconnu (zone fermée). */
export const villeParId = (id) => VILLES.find((v) => v.id === id) || null;
