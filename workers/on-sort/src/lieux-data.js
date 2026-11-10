// Lieux permanents — données. Chaque lieu est vérifié sur une source
// officielle avant d'entrer ici (adresse, coordonnées, âge, tarif, fermeture).
// Un champ non vérifié reste à null : on n'estime pas.
//
// Forme : { id, titre, description, ville, adresse, lat, lon,
//           lieuType: 'interieur' | 'exterieur',
//           ageMin, ageMax,            // null si la source ne dit rien
//           gratuit,                   // true | false | null (non écrit)
//           fermeJours: [0-6],         // 0 = dimanche ; [] si inconnu
//           saison: null | { debut: 'MM-JJ', fin: 'MM-JJ' },
//           url }
//
// Rennes / Bruz — relevé du 10 novembre 2026 (sites de la Ville de Bruz, de
// Rennes Métropole, de l'office de tourisme de Rennes, des lieux eux-mêmes ;
// coordonnées OpenStreetMap). Pas d'horaires ni de tarifs recopiés dans les
// descriptions : ils changent, la fiche renvoie au site.
//
// Écartés faute de source assez sûre (à reprendre) : ludothèque L'île aux
// jeux de Bruz (horaires et conditions non publiés — à confirmer par
// téléphone), Gulli Parc Cesson (jours d'ouverture en période scolaire
// ambigus), Musée de Bretagne (déjà remonté par l'agenda), parc
// ornithologique de Bruz (ouverture actuelle non confirmée).
// À revoir chaque année : saison des Jardins de Brocéliande.

export const LIEUX = [
  // --- Bruz ---
  {
    id: 'aire-jeux-parc-surcouf-bruz',
    titre: 'Aire de jeux du parc Surcouf',
    description: 'Structure en bois en forme de bateau pirate avec toboggan, rampe d’accès et balançoires. Sous la surveillance des parents.',
    ville: 'Bruz', adresse: '27 rue Surcouf, 35170 Bruz', lat: 48.0201271, lon: -1.7377895,
    lieuType: 'exterieur', ageMin: 1, ageMax: 10, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.ville-bruz.fr/points-interets/aire-de-jeux-du-parc-surcouf/',
  },
  {
    id: 'parc-herverie-bruz',
    titre: 'Parc de la Herverie',
    description: 'Parc de grands arbres à l’emplacement de l’ancien château des Planches, avec des jeux pour enfants.',
    ville: 'Bruz', adresse: 'Parc de la Herverie, 35170 Bruz', lat: 48.0243614, lon: -1.7507129,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.ville-bruz.fr/points-interets/parc-de-la-herverie/',
  },
  {
    id: 'parc-an-2000-bruz',
    titre: 'Parc de l’An 2000',
    description: 'Une promenade à pied dans la nature : pâtures, petits ponts de bois, lavoir et chemins au bord de la Seiche. Pas de jeux, classé refuge LPO.',
    ville: 'Bruz', adresse: 'Parc de l’An 2000, 35170 Bruz', lat: 48.0167405, lon: -1.7494881,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.ville-bruz.fr/points-interets/parc-de-lan-2000/',
  },
  {
    id: 'mediatheque-bruz',
    titre: 'Médiathèque de Bruz — Le Grand Logis',
    description: 'Espace jeunesse avec albums, bandes dessinées et jeux de société à utiliser sur place. Lecture et consultation sur place libres et gratuites.',
    ville: 'Bruz', adresse: '10 avenue du Général de Gaulle, 35170 Bruz', lat: 48.0229895, lon: -1.7449119,
    lieuType: 'interieur', ageMin: null, ageMax: null, gratuit: true, fermeJours: [0, 1, 4], saison: null,
    url: 'https://www.mediatheque-bruz.fr/',
  },
  // --- Sud de Rennes et alentours ---
  {
    id: 'piscine-conterie',
    titre: 'Piscine intercommunale de la Conterie',
    description: 'Pataugeoire avec geysers et jets d’eau, et bassin ludique chauffé avec toboggan, rivière à courant et jets d’eau.',
    ville: 'Chartres-de-Bretagne', adresse: '2 rue Léo Lagrange, 35131 Chartres-de-Bretagne', lat: 48.0399719, lon: -1.6922919,
    lieuType: 'interieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.chartresdebretagne.fr/accueil/bouger-sortir/les-loisirs/la-piscine-intercommunale-de-la-conterie/',
  },
  {
    id: 'jardins-broceliande',
    titre: 'Les Jardins de Brocéliande',
    description: 'Jardins avec aires de jeux, animaux et parcours ludiques, dont un parcours pieds nus dès 2 ans et un parcours en hauteur dès 3 ans. Entrée payante.',
    ville: 'Bréal-sous-Montfort', adresse: 'Les Mesnils, 35310 Bréal-sous-Montfort', lat: 48.0541128, lon: -1.8904887,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: false, fermeJours: [],
    saison: { debut: '03-28', fin: '11-01' }, // dates 2026 — à mettre à jour chaque année
    url: 'https://www.jardinsdebroceliande.fr/',
  },
  {
    id: 'ecomusee-bintinais',
    titre: 'Écomusée de la Bintinais',
    description: 'Ferme-musée : les animaux de l’écomusée (races locales), le potager, les vergers et les cultures. Trottinettes, draisiennes et vélos interdits sur le site.',
    ville: 'Rennes', adresse: 'Route de Châtillon-sur-Seiche, 35200 Rennes', lat: 48.0789275, lon: -1.6674705,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: true, fermeJours: [1], saison: null,
    url: 'https://www.ecomusee-rennes-metropole.fr/',
  },
  {
    id: 'parc-brequigny',
    titre: 'Parc de Bréquigny',
    description: 'Parc avec des jeux pour les petits et les grands, et une pataugeoire ouverte l’été pour se rafraîchir.',
    ville: 'Rennes', adresse: 'Rue d’Angleterre, 35000 Rennes', lat: 48.0822218, lon: -1.6877499,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.tourisme-rennes.com/sortir/parc-de-brequigny/',
  },
  {
    id: 'parc-hautes-ourmes',
    titre: 'Parc des Hautes-Ourmes',
    description: 'Parc boisé, « le domaine des enfants » selon l’office de tourisme : toboggan, bac à sable, et pataugeoire l’été.',
    ville: 'Rennes', adresse: '195 rue de Vern, 35200 Rennes', lat: 48.089908, lon: -1.6464307,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.tourisme-rennes.com/decouvrir-rennes/nature/liste-jardins-parcs/',
  },
  {
    id: 'etangs-apigne',
    titre: 'Les Étangs d’Apigné',
    description: 'Base de loisirs ouverte toute l’année, avec une plage au bord de l’étang. Baignade surveillée l’été.',
    ville: 'Rennes', adresse: 'Chemin de la Prévalaye, 35000 Rennes', lat: 48.0949864, lon: -1.7420292,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.tourisme-rennes.com/sortir/les-etangs-dapigne/',
  },
  // --- Rennes centre et nord ---
  {
    id: 'bibliotheque-champs-libres',
    titre: 'Bibliothèque des Champs Libres — espace enfants',
    description: 'Espace enfants au rez-de-chaussée : tapis moelleux et cabanes pour une pause lecture en accès libre, ordinateurs avec des jeux adaptés aux plus petits.',
    ville: 'Rennes', adresse: '10 cours des Alliés, 35000 Rennes', lat: 48.1051387, lon: -1.6746861,
    lieuType: 'interieur', ageMin: null, ageMax: null, gratuit: true, fermeJours: [1], saison: null,
    url: 'https://www.leschampslibres.fr/venir/les-champs-libres-en-famille',
  },
  {
    id: 'parc-thabor',
    titre: 'Parc du Thabor',
    description: 'Grand parc du centre de Rennes avec une aire de jeux pour enfants, un manège et une volière.',
    ville: 'Rennes', adresse: 'Place Saint-Melaine, 35000 Rennes', lat: 48.1138888, lon: -1.669803,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.tourisme-rennes.com/sortir/parc-du-thabor/',
  },
  {
    id: 'parc-maurepas',
    titre: 'Parc de Maurepas',
    description: 'Parc avec une aire de jeux, un manège et un espace skate, roller et vélo pour les enfants.',
    ville: 'Rennes', adresse: '16 boulevard Raymond Poincaré, 35700 Rennes', lat: 48.1229805, lon: -1.6561224,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.tourisme-rennes.com/sortir/parc-de-maurepas/',
  },
  {
    id: 'parc-gayeulles',
    titre: 'Parc des Gayeulles',
    description: 'Très grand parc avec une aire de jeux pour enfants, des aires de pique-nique, un mini-golf et une ferme pédagogique.',
    ville: 'Rennes', adresse: 'Avenue des Gayeulles, 35700 Rennes', lat: 48.1343196, lon: -1.6463503,
    lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: null, fermeJours: [], saison: null,
    url: 'https://www.tourisme-rennes.com/decouvrir-rennes/week-end/gayeulles/',
  },
  {
    id: 'piscine-gayeulles',
    titre: 'Piscine des Gayeulles',
    description: 'Piscine avec un espace ludique : piscine à vagues et lagune pour les plus petits. Entrée payante.',
    ville: 'Rennes', adresse: '16 avenue des Gayeulles, 35700 Rennes', lat: 48.1346158, lon: -1.6507219,
    lieuType: 'interieur', ageMin: null, ageMax: null, gratuit: false, fermeJours: [], saison: null,
    url: 'https://culture-sport.metropole.rennes.fr/organisations/piscine-gayeulles/',
  },
];
