// Contrôle danger — passe AVANT toute IA (spec § 5, étape 2).
// Un message qui laisse craindre une urgence médicale, un risque pour
// l'enfant ou une détresse du papa reçoit une réponse fixe avec les bons
// numéros, et le traitement s'arrête là. Mieux vaut une fausse alerte (une
// blague du type « je vais le tuer ») qu'une vraie urgence ratée.
//
// Une crise ordinaire (colère, refus de dormir, il tape sa sœur) n'est PAS
// un danger : elle part en SOS crise. tests/danger.test.js tient les deux
// listes à jour.
//
// Le routeur IA (lot 2) ajoute un second filet : son champ `danger`.

/** Minuscules, sans accents, apostrophes et espaces normalisés. */
export function normaliser(texte) {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const ENFANT = "(?:mon|ma|mes|le|la|les|l')?\\s?(?:fils|fille|enfant|enfants|bebe|petit|petite|gamin|gamine|loulou)";

const MOTIFS = {
  // Urgence vitale ou ingestion : le 15 d'abord.
  medical: [
    /ne respire (?:plus|pas|presque plus|mal)/,
    /respire (?:mal|difficilement|tres mal)/,
    /s'etouffe|etouffe(?!e? de rire)/,
    /convuls/,
    /inconscient|perdu connaissance|evanoui/,
    /ne (?:se )?reveille (?:plus|pas)|ne reagit plus/,
    /(?:levres|visage) (?:(?:sont|est|devient|deviennent|toutes?|tout) )?(?:bleu|bleues|violet|violettes)|devient bleu/,
    /a? ?avale (?:un |une |des |du |de la |de l')?(?:pile|piles|medicament|medicaments|cachet|cachets|comprime|comprimes|javel|produit|aimant|aimants|lessive|capsule)/,
    /(?:grosse|grave|grande) brulure|brule (?:grave|gravement|au visage)/,
    /saigne (?:beaucoup|fort|abondamment|enormement|sans arret)/,
    /tombe (?:de la|du|par la) (?:fenetre|balcon)/,
    /tombe sur la tete.*(?:vomi|somnol|endormi|bizarre)/,
  ],
  // Détresse du papa : le 3114.
  suicide: [
    /(?:me|m') ?(?:tuer|suicider)/,
    /suicid/,
    /en finir avec (?:la vie|tout|moi)|je veux en finir/,
    /(?:plus|pas) envie de vivre|envie de mourir|je veux mourir/,
    /mettre fin a mes jours/,
  ],
  // Risque pour l'enfant, y compris un papa à bout : le 119.
  enfance: [
    new RegExp(`envie de (?:le|la|les|l') ?(?:frapper|taper|secouer|cogner|tuer|etrangler)`),
    new RegExp(`je vais (?:le|la|les|l') ?(?:frapper|taper|secouer|cogner|tuer|etrangler)`),
    new RegExp(`(?:je l'ai|je les ai|j'ai) (?:frappe|secoue|cogne|gifle)(?: ${ENFANT})?`),
    /secou(?:e|er|é) (?:le |mon |un )?bebe/,
    /peur de (?:lui|leur) faire du mal|(?:lui|leur) faire du mal/,
    /maltrait/,
  ],
};

const REPONSES = {
  medical:
    '🚨 *Urgence : appelle le 15 (SAMU) ou le 112 maintenant.*\n'
    + 'Au téléphone, le médecin te guide pas à pas pendant que tu agis. '
    + 'S\'il a avalé quelque chose, garde l\'emballage à portée de main.',
  suicide:
    'Ce que tu traverses compte, et tu n\'as pas à le porter seul.\n'
    + '*Appelle le 3114* : prévention du suicide, gratuit, 24 h/24, des pros t\'écoutent.\n'
    + 'Si tu es en danger tout de suite : 15 ou 112.',
  enfance:
    'Tu as bien fait de l\'écrire. Si tu sens que ça peut déraper : '
    + 'pose ton enfant en sécurité (son lit, une pièce fermée), sors respirer cinq minutes.\n'
    + '*Le 119* répond 24 h/24, gratuit et anonyme, aussi aux parents à bout.\n'
    + 'Danger immédiat : 17 ou 112.',
};

// Ordre de priorité : la vie de l'enfant d'abord.
const ORDRE = ['medical', 'suicide', 'enfance'];

/**
 * @param {string} texte message du papa (ou transcription d'un vocal)
 * @returns {null | { type: 'medical'|'suicide'|'enfance', reponse: string }}
 */
export function detecterDanger(texte) {
  const t = normaliser(texte);
  if (!t) return null;
  for (const type of ORDRE) {
    if (MOTIFS[type].some((m) => m.test(t))) return { type, reponse: REPONSES[type] };
  }
  return null;
}

/** Réponse fixe d'un type de danger (sert au second filet du routeur IA). */
export const reponseDanger = (type) => REPONSES[type] || REPONSES.enfance;
