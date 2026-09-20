// Configuration de l'app — worker + villes proposées à l'onboarding.
// Chaque ville porte son département : le worker filtre OpenAgenda par nom de
// département (`dept`), la météo part de lat/lon. Ouvrir une zone = ajouter
// des villes ici, rien d'autre.
//
// Zones ouvertes là où OpenAgenda a de la matière (mesuré le 19 septembre
// 2026, sorties « famille » un samedi) : Bretagne (zone de naissance, dense
// en Ille-et-Vilaine seulement), puis Loire-Atlantique 57, Nord 90, Gironde
// 44, Paris 43. Calvados, Angers, Le Mans, Lyon, Marseille, Toulouse
// attendent une autre source ou des demandes de ville.

/** Backend Sorties. Surchargeable en dev (`EXPO_PUBLIC_WORKER_URL=http://127.0.0.1:8787`)
 *  pour tester un worker local (`npx wrangler dev`) avant de le déployer. */
export const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL || 'https://on-sort-poc.loumiwassim.workers.dev';

export const RAYON_KM = 40;

/** Points de départ proposés. Bretagne d'abord, puis les zones ouvertes. */
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
  // Calvados testé et écarté (19 septembre 2026) : 21 sorties « famille » au
  // diagnostic brut, mais 0 à 3 retenues une fois les créneaux du jour et
  // l'âge appliqués, sur cinq dates. À rouvrir si la source s'étoffe.
  // Paris (intra-muros : le rayon de 40 km couvre la petite couronne)
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

/** Âges enfant proposés à la création de compte : 0 à 5 ans.
 *  C'est cette valeur qui part au worker (`/top?age=`) : le scoring écarte les
 *  événements dont l'âge minimum dépasse celui de l'enfant. */
export const AGES_ENFANT = [0, 1, 2, 3, 4, 5];

/** Départements de la zone de lancement, dérivés de VILLES (ordre stable). */
export const DEPARTEMENTS = VILLES.reduce((acc, v) => {
  if (!acc.some((d) => d.code === v.code)) acc.push({ code: v.code, nom: v.dept });
  return acc;
}, []);

/** Villes d'un département (par code INSEE : '35', '22', '56', '29'). */
export const villesParDept = (code) => VILLES.filter((v) => v.code === code);

/** Lien ajouté aux partages : l'URL publique de l'app web (PWA installable).
 *  À remplacer par le lien Play Store quand la beta Android sera en ligne. */
export const LIEN_APP = 'https://papa-parfait-web.loumiwassim.workers.dev';

/** Bouton « Continuer avec Google ».
 *  Rouvert le 20 septembre 2026, une fois le retour de session traité : sur
 *  web la connexion passe par une redirection pleine page (le popup était
 *  bloqué par la politique COOP), et au retour l'app lit la session, charge le
 *  profil s'il existe, sinon rouvre un onboarding allégé. */
export const GOOGLE_ACTIF = true;

/** Piliers actifs. Couple/Moi/Tribu sont en teaser (vote « Ça m'intéresse »)
 *  tant que les Sorties n'ont pas fait leurs preuves — passer un pilier à
 *  true réactive l'écran complet correspondant, déjà codé. */
export const PILIERS_ACTIFS = { couple: false, moi: false, tribu: false };
