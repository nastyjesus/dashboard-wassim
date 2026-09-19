// Données de démonstration — clairement FICTIVES (mock:true dans toutes les
// réponses). Servent à développer le front et à tester le pipeline sans
// réseau. Aucune de ces sorties n'existe : ne jamais les présenter comme
// des données réelles.

export const MOCK_METEO = {
  tmax: 14, precipProb: 72, code: 61, pluie: true,
  resume: 'Pluie probable, 14°C max',
};

/** Événements fictifs façonnés comme la sortie des sources normalisées. */
export const MOCK_EVENEMENTS = [
  {
    source: 'mock', id: 'demo-1',
    titre: '[DÉMO] Atelier marionnettes jeune public',
    description: 'Atelier de fabrication de marionnettes pour les enfants de 3 à 6 ans, suivi d’un mini-spectacle. Gratuit sur inscription.',
    motsCles: ['enfant', 'atelier'], dateDebut: null, dateFin: null,
    horaires: 'Samedi 10h-12h', lieuNom: 'Médiathèque (démo)',
    adresse: '35170 Bruz', ville: 'Bruz', lat: 48.024, lon: -1.745,
    url: null, gratuit: true,
  },
  {
    source: 'mock', id: 'demo-2',
    titre: '[DÉMO] Balade contée en forêt',
    description: 'Balade en plein air ponctuée de contes, en famille, dès 3 ans.',
    motsCles: ['famille', 'nature'], dateDebut: null, dateFin: null,
    horaires: 'Samedi 15h', lieuNom: 'Forêt (démo)',
    adresse: '35510 Cesson-Sévigné', ville: 'Cesson-Sévigné', lat: 48.121, lon: -1.603,
    url: null, gratuit: false,
  },
  {
    source: 'mock', id: 'demo-3',
    titre: '[DÉMO] Éveil musical des tout-petits',
    description: 'Séance d’éveil musical pour les bébés et tout-petits (0-3 ans).',
    motsCles: ['bébé'], dateDebut: null, dateFin: null,
    horaires: 'Samedi 11h', lieuNom: 'Salle polyvalente (démo)',
    adresse: '35000 Rennes', ville: 'Rennes', lat: 48.111, lon: -1.68,
    url: null, gratuit: false,
  },
  {
    source: 'mock', id: 'demo-4',
    titre: '[DÉMO] Conférence d’histoire locale',
    description: 'Conférence universitaire, public adulte.',
    motsCles: [], dateDebut: null, dateFin: null,
    horaires: 'Samedi 18h', lieuNom: 'Amphithéâtre (démo)',
    adresse: '35000 Rennes', ville: 'Rennes', lat: 48.117, lon: -1.677,
    url: null, gratuit: true,
  },
  {
    source: 'mock', id: 'demo-5',
    titre: '[DÉMO] Visite de la ferme pédagogique',
    description: 'Rencontre avec les animaux de la ferme, jeux en famille, dès 2 ans. Entrée libre.',
    motsCles: ['famille', 'animaux'], dateDebut: null, dateFin: null,
    horaires: 'Samedi 14h-18h', lieuNom: 'Ferme (démo)',
    adresse: '35235 Thorigné-Fouillard', ville: 'Thorigné-Fouillard', lat: 48.158, lon: -1.579,
    url: null, gratuit: true,
  },
  {
    source: 'mock', id: 'demo-6',
    titre: '[DÉMO] Spectacle de contes et comptines',
    description: 'Spectacle jeune public à la médiathèque, de 2 à 5 ans.',
    motsCles: ['jeune public'], dateDebut: null, dateFin: null,
    horaires: 'Samedi 16h30', lieuNom: 'Médiathèque (démo)',
    adresse: '35770 Vern-sur-Seiche', ville: 'Vern-sur-Seiche', lat: 48.045, lon: -1.595,
    url: null, gratuit: true,
  },
];

export function isMock(env) {
  return String(env.MOCK_MODE).toLowerCase() === 'true';
}
