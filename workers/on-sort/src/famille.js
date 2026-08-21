// Détection « famille » : est-ce qu'un événement convient à une sortie avec
// un enfant, pour quel âge, et se passe-t-il plutôt dedans ou dehors ?
// Tout est heuristique sur le texte (titre + description + mots-clés) — les
// sources open data n'ont pas de champ « âge » fiable. Le /diagnostic mesure
// justement si ces heuristiques laissent passer assez de volume.

/** Mots-clés forts : l'événement est explicitement pensé pour les enfants. */
const FORTS = [
  'jeune public', 'enfant', 'enfants', 'famille', 'familial', 'familiale',
  'marionnette', 'conte', 'bébé', 'bebe', 'tout-petit', 'tout petit',
  'éveil', 'eveil', 'kids', 'p’tit', "p'tit", 'comptine', 'kamishibai',
];

/** Mots-clés faibles : souvent compatibles enfants, sans garantie. */
const FAIBLES = [
  'atelier', 'jeux', 'ludique', 'ferme', 'animaux', 'magie', 'cirque',
  'chasse au trésor', 'chasse au tresor', 'goûter', 'gouter', 'lecture',
  'bricolage', 'nature', 'poney',
];

/** Signaux d'exclusion : clairement pas pour un enfant de 3 ans. */
const EXCLUSIONS = [
  'interdit aux moins', 'public adulte', 'réservé aux adultes', 'reserve aux adultes',
  'soirée dansante', 'soiree dansante', 'dégustation de vin', 'degustation de vin',
  'afterwork', 'speed dating', 'conférence', 'conference', 'colloque', 'séminaire', 'seminaire',
];

const INTERIEUR = [
  'musée', 'musee', 'bibliothèque', 'bibliotheque', 'médiathèque', 'mediatheque',
  'cinéma', 'cinema', 'théâtre', 'theatre', 'salle', 'espace culturel', 'ludothèque',
  'ludotheque', 'piscine', 'atelier', 'exposition', 'planétarium', 'planetarium',
];

const EXTERIEUR = [
  'balade', 'randonnée', 'randonnee', 'plein air', 'parc', 'jardin', 'forêt',
  'foret', 'plage', 'marché', 'marche ', 'ferme', 'sentier', 'vélo', 'velo',
  'pique-nique', 'fête foraine', 'fete foraine',
];

function normalise(texte) {
  return (texte || '').toLowerCase();
}

function compte(texte, mots) {
  return mots.filter((m) => texte.includes(m)).length;
}

/**
 * Score famille de 0 (rien n'indique un événement adapté) à 3 (explicitement
 * jeune public). Négatif si signal d'exclusion.
 * @param {{titre?: string, description?: string, motsCles?: string[]}} ev
 */
export function scoreFamille(ev) {
  const texte = normalise([ev.titre, ev.description, (ev.motsCles || []).join(' ')].join(' '));
  if (compte(texte, EXCLUSIONS) > 0) return -1;
  const forts = compte(texte, FORTS);
  const faibles = compte(texte, FAIBLES);
  if (forts >= 2) return 3;
  if (forts === 1) return 2;
  if (faibles >= 2) return 1;
  return faibles === 1 ? 0.5 : 0;
}

/**
 * Tente d'extraire une tranche d'âge du texte. Retourne {min, max} en années
 * (max = null si non borné), ou null si aucune indication.
 */
export function trancheAge(ev) {
  const texte = normalise([ev.titre, ev.description].join(' '));
  // « de 3 à 6 ans », « 3-6 ans », « 3 à 6 ans »
  let m = texte.match(/(\d{1,2})\s*(?:à|a|-|\/)\s*(\d{1,2})\s*ans/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  // « à partir de 4 ans », « dès 4 ans » (ou en mois)
  m = texte.match(/(?:à partir de|a partir de|dès|des)\s*(\d{1,2})\s*(ans|mois)/);
  if (m) {
    const val = Number(m[1]);
    return { min: m[2] === 'mois' ? Math.floor(val / 12) : val, max: null };
  }
  if (/tout-petit|tout petit|bébé|bebe|0-3 ans/.test(texte)) return { min: 0, max: 3 };
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
