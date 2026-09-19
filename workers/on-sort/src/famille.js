// Détection « famille » : est-ce qu'un événement convient à une sortie avec
// un enfant, pour quel âge, et se passe-t-il plutôt dedans ou dehors ?
// Tout est heuristique sur le texte (titre + description + mots-clés) — les
// sources open data n'ont pas de champ « âge » fiable. Le /diagnostic mesure
// justement si ces heuristiques laissent passer assez de volume.
//
// Révision du 19 septembre 2026, après lecture d'un corpus de 248 événements
// retenus sur 5 départements : les faux positifs venaient de quatre endroits.
//  1. Le mot « enfant(s) » comme SUJET, pas comme PUBLIC : expos et pièces
//     sur l'enfance, comédies sur la famille, « 2 enfants » dans un synopsis.
//     → Les mots génériques (enfant, famille…) ne comptent que si le texte
//       nomme aussi un public (« pour les enfants », « en famille », un âge).
//  2. Des événements réservés aux adultes ou aux parents seuls : « pour
//     adultes », consultations, formations, cours annuels, braderies.
//     → Nouvelles exclusions, dont quelques-unes sur le titre seul.
//  3. Des expressions piégées : « à tout petit prix », « les sens en éveil ».
//     → Nettoyées avant le matching.
//  4. Des tranches d'âge non lues : « entre 5 et 8 ans », « 6 mois - 3 ans »,
//     « ados ». → Nouveaux motifs.

/** Mots forts spécifiques : ils ne veulent dire qu'une chose, un public enfant. */
const FORTS_SPECIFIQUES = [
  'jeune public', 'marionnette', 'marionnettique', 'conte', 'bébé', 'bebe',
  'tout-petit', 'tout petit', 'éveil', 'eveil', 'kids', "p'tit",
  'comptine', 'kamishibai', 'maquillage', 'fête foraine', 'fete foraine',
  'manège', 'manege', 'spectacle familial',
];

/** Mots forts génériques : parlent d'enfants ou de famille, sans dire pour qui.
 *  (Le matching accepte déjà le pluriel : « enfant » couvre « enfants ».
 *  Lister les deux comptait double.) « Kermesse » est ici : c'est aussi un
 *  nom de spectacle, il lui faut un public nommé pour compter. */
const FORTS_GENERIQUES = ['enfant', 'famille', 'familial', 'familiale', 'kermesse'];

const FORTS = [...FORTS_SPECIFIQUES, ...FORTS_GENERIQUES];

/** Mots-clés faibles : souvent compatibles enfants, sans garantie. */
const FAIBLES = [
  'atelier', 'jeux', 'ludique', 'ferme', 'animaux', 'magie', 'cirque',
  'chasse au trésor', 'chasse au tresor', 'goûter', 'gouter', 'lecture',
  'bricolage', 'nature', 'poney',
];

/** Signaux d'exclusion : clairement pas pour un enfant de 3 ans. */
const EXCLUSIONS = [
  'interdit aux moins', 'public adulte', 'réservé aux adultes', 'reserve aux adultes',
  'pour adultes', 'pour adulte', 'ados-adultes', 'ados et adultes', 'adolescents et adultes',
  'soirée dansante', 'soiree dansante', 'dégustation de vin', 'degustation de vin',
  'dégustation de bière', 'degustation de biere', 'apéritif', 'aperitif', 'apéro', 'apero',
  'microbrasserie', 'evg', 'evjf',
  'afterwork', 'speed dating', 'conférence', 'conference', 'colloque', 'séminaire', 'seminaire',
  "journée d'étude", 'journee d etude', 'consultation', 'consultations', 'notaire', 'notariales',
  'formation', 'discussion', 'débat', 'debat', 'table ronde',
  'baby-sitting', 'babysitting', 'baby sitting',
  'humoriste', 'one man show', 'one-man-show', 'stand-up', 'stand up',
  'seul-en-scène', 'seul en scène', 'seul-en-scene', 'seul en scene',
  // Emploi / recrutement / pro — jamais une sortie avec un enfant. Variantes
  // accentuées ET non accentuées : les titres open data sont souvent en CAPS.
  'emploi', 'emplois', 'recrutement', 'recrute', 'recrutent',
  'intérim', 'interim', 'intérimaire', 'interimaire',
  'job dating', 'job', 'jobs', 'forum des métiers', 'forum emploi', "forum de l'emploi",
  'pôle emploi', 'pole emploi', 'france travail', "entretien d'embauche", 'embauche',
  'candidature', 'alternance', 'apprenti', 'apprentie',
  'réserviste', 'réservistes', 'reserviste', 'reservistes', 'marine nationale',
  'insertion professionnelle', "création d'entreprise", 'creation d entreprise', 'cv',
  // Bien-être / développement perso / orientation-reconversion — public adulte.
  'reconversion', 'reconvertir', 'orientation professionnelle',
  'santé mentale', 'sante mentale', 'développement personnel', 'developpement personnel',
  // Commerce, sport de club, vie associative adulte : pas une sortie enfant.
  'braderie', 'vide-grenier', 'vide grenier', 'troc', 'vente de livres',
  'match', 'championnat', "séance d'essai", "séances d'essais", 'séances d’essais',
];

/**
 * Exclusions sur le titre seul : là où ces mots n'ont qu'un sens.
 * (Dans la description, « sur inscription » ou « au cours de l'atelier » sont
 * banals et innocents.)
 */
const TITRES_EXCLUS = [
  /^\s*complet\b/i,            // « COMPLET Rythmes et comptines »
  /\bcomplet\s*[/:\-–]/i,      // « COMPLET/Pique ma curiosité »
  /\bannul[ée]/i,
  /\breport[ée]/i,
  /^\s*inscriptions?\b/i,      // « Inscription : Sport en anglais » = saison annuelle
  /^\s*cours\s+(de|d['’]|collectifs?)\b/i, // « Cours de dessin » = abonnement à l'année
];

/**
 * Expressions où un mot fort apparaît sans parler d'enfants. Retirées du texte
 * avant le matching.
 */
const PIEGES = [
  /\bà tout petit prix\b/g, /\btout petit prix\b/g, /\bpetits prix\b/g,
  /\ben éveil\b/g, /\ben eveil\b/g,
  /\bfamille mary\b/g, // marque
];

/**
 * Indices qu'un PUBLIC enfant est visé (et pas seulement le thème de
 * l'enfance). Exigés quand seuls des mots génériques ont matché.
 */
const PUBLIC_ENFANT = new RegExp([
  "pour (les |vos |tes |nos |ses |leurs |des |l['’])?(enfants?|tout-petits|tout petits|petits|bébés|bebes|familles?|jeune public|jeunes)",
  'aux (enfants|tout-petits|tout petits|petits|bébés|bebes|familles)',
  "(parents?|enfants?|adultes?)\\s*(et|&|/|-|–)\\s*(leurs? |vos |les )?(enfants?|parents?)",
  'avec (vos|tes|ses|leurs|votre|ton|son) enfants?',
  'en famille', 'jeune public', 'petits et grands', 'grands et petits', 'petites et grands',
  'tout-petits', 'tout petits', 'les enfants', 'vos enfants', 'tes enfants',
  'dès \\d', 'à partir de \\d', 'a partir de \\d', 'accompagn',
  'maternelle', 'jeunesse',
  // Le tutoiement des programmes de médiathèque s'adresse aux enfants :
  // « viens fabriquer ton marque-page », « tu as entre 5 et 8 ans ? ».
  '\\bviens\\b', '\\btu as\\b', '\\btu aimes\\b', '\\btu veux\\b', '\\bdeviens\\b',
].join('|'), 'u');
// NB : « N ans » seul n'est pas un indice — « 10 ans de mariage », « 52 ans »
// dans un synopsis. Les âges passent par trancheAge(), plus stricte.

const INTERIEUR = [
  'musée', 'musee', 'bibliothèque', 'bibliotheque', 'médiathèque', 'mediatheque',
  'cinéma', 'cinema', 'théâtre', 'theatre', 'salle', 'espace culturel', 'ludothèque',
  'ludotheque', 'piscine', 'atelier', 'exposition', 'planétarium', 'planetarium',
];

const EXTERIEUR = [
  'balade', 'randonnée', 'randonnee', 'plein air', 'parc', 'jardin', 'forêt',
  'foret', 'plage', 'marché', 'ferme', 'sentier', 'vélo', 'velo',
  'pique-nique', 'fête foraine', 'fete foraine',
];

function normalise(texte) {
  // Apostrophe typographique → droite : les listes sont écrites avec la droite,
  // les données arrivent avec les deux (« séance d’essai », « p’tit »).
  let t = (texte || '').toLowerCase().replace(/[’‘]/g, "'");
  for (const piege of PIEGES) t = t.replace(piege, ' ');
  return t;
}

function echapper(mot) {
  return mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matching par mot entier, pas par sous-chaîne : « contemporaine » ne doit
// pas compter comme « conte », ni « réveil » comme « éveil » (bug constaté
// sur données réelles : toutes les expos d'art contemporain passaient pour
// du jeune public).
function compte(texte, mots) {
  return mots.filter((m) => new RegExp(`(^|[^\\p{L}])${echapper(m)}s?(?![\\p{L}])`, 'u').test(texte)).length;
}

/**
 * Analyse famille complète.
 * @returns {{score: number, specifique: boolean}}
 *  - score : 0 (rien) à 3 (explicitement jeune public), négatif si exclu ;
 *  - specifique : un mot fort SPÉCIFIQUE a matché (l'étiquette « Pensé pour
 *    les enfants » n'est honnête que dans ce cas ou avec un âge).
 */
export function analyseFamille(ev) {
  const texte = normalise([ev.titre, ev.description, (ev.motsCles || []).join(' ')].join(' '));
  if (compte(texte, EXCLUSIONS) > 0) return { score: -1, specifique: false };
  if (TITRES_EXCLUS.some((re) => re.test(ev.titre || ''))) return { score: -1, specifique: false };

  const specifiques = compte(texte, FORTS_SPECIFIQUES);
  const generiques = compte(texte, FORTS_GENERIQUES);
  const forts = specifiques + generiques;
  const faibles = compte(texte, FAIBLES);
  // Un public est nommé si le texte le dit, ou s'il donne une tranche d'âge.
  const publicEnfant = PUBLIC_ENFANT.test(texte) || trancheAge(ev) !== null;

  if (specifiques >= 1) return { score: forts >= 2 ? 3 : 2, specifique: true };
  if (generiques >= 1) {
    // « enfants » sans public nommé = un thème, pas une sortie. On retombe au
    // niveau d'un simple indice.
    if (!publicEnfant) return { score: 0.5, specifique: false };
    return { score: generiques >= 2 ? 3 : 2, specifique: false };
  }
  // Mots faibles seuls : deux mots faibles + un public nommé (« petits et
  // grands », « dès 5 ans ») → indice ; sinon c'est presque toujours un atelier
  // adulte (bricolage, jardinage, lecture).
  if (faibles >= 2) return { score: publicEnfant ? 1 : 0.5, specifique: false };
  return { score: faibles === 1 ? 0.5 : 0, specifique: false };
}

/**
 * Score famille de 0 (rien n'indique un événement adapté) à 3 (explicitement
 * jeune public). Négatif si signal d'exclusion.
 * @param {{titre?: string, description?: string, motsCles?: string[]}} ev
 */
export function scoreFamille(ev) {
  return analyseFamille(ev).score;
}

/**
 * Tente d'extraire une tranche d'âge du texte. Retourne {min, max} en années
 * (max = null si non borné), ou null si aucune indication.
 */
export function trancheAge(ev) {
  const texte = normalise([ev.titre, ev.description].join(' '));
  let m;
  // « 6 mois - 3 ans », « de 6 mois à 3 ans », « 18 mois à 4 ans »
  m = texte.match(/(\d{1,2})\s*mois\s*(?:à|a|-|–|et)\s*(\d{1,2})\s*ans/);
  if (m) return { min: Math.floor(Number(m[1]) / 12), max: Number(m[2]) };
  // « de la naissance à 4 ans »
  m = texte.match(/naissance\s*(?:à|a|-|–)\s*(\d{1,2})\s*ans/);
  if (m) return { min: 0, max: Number(m[1]) };
  // « de 3 à 6 ans », « 3-6 ans », « 3 à 6 ans », « entre 5 et 8 ans »
  m = texte.match(/(\d{1,2})\s*(?:à|a|-|–|\/|et)\s*(\d{1,2})\s*ans/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  // « à partir de 4 ans », « dès 4 ans » (ou en mois)
  m = texte.match(/(?:à partir de|a partir de|dès|des)\s*(\d{1,2})\s*(ans|mois)/);
  if (m) {
    const val = Number(m[1]);
    return { min: m[2] === 'mois' ? Math.floor(val / 12) : val, max: null };
  }
  // « 6 ans et plus », « 6 ans et +»
  m = texte.match(/(\d{1,2})\s*ans\s*et\s*(?:plus|\+)/);
  if (m) return { min: Number(m[1]), max: null };
  if (/tout-petit|tout petit|bébé|bebe|0-3 ans/.test(texte)) return { min: 0, max: 3 };
  // Collège / lycée : l'enfant concerné a 11 ans ou plus, même si le texte dit
  // « votre enfant » (« accompagner son enfant au collège »).
  if (/\b(collégiens?|collegiens?|lycéens?|lyceens?|collège|college|lycée|lycee)\b/.test(texte)) {
    return { min: 11, max: null };
  }
  // Public ado sans mention d'enfants ni de petits : pas pour un petit.
  // (« famille » ne compte pas comme marqueur de petit : « comédie familiale,
  // adulte ou ado » vise les ados.)
  const ados = /\b(ados?|adolescent(?:e)?s?)\b/.test(texte);
  const petits = /\b(enfants?|petits?|bébés?|bebes?|tout-petits?)\b/.test(texte);
  if (ados && !petits) return { min: 11, max: null };
  return null;
}

/**
 * 'interieur' | 'exterieur' | 'inconnu' — sert au score météo.
 */
export function lieuType(ev) {
  const texte = normalise([ev.titre, ev.description, ev.lieuNom].join(' '));
  const dedans = compte(texte, INTERIEUR);
  const dehors = compte(texte, EXTERIEUR);
  if (dedans === 0 && dehors === 0) return 'inconnu';
  return dedans >= dehors ? 'interieur' : 'exterieur';
}
