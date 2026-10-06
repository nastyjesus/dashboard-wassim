// Descriptions lisibles : les sources livrent du HTML (paragraphes, listes,
// retours à la ligne) que l'on aplatissait en un seul bloc, coupé net à
// 1 200 caractères en plein mot (« Stages réservés aux es », fiche Ouescrime,
// 6 octobre 2026). On garde désormais un paragraphe par ligne et l'on coupe
// en fin de phrase.
//
// Deux longueurs :
//  - DESCRIPTION_SCORING (1 200) : ce que lisent les heuristiques (famille,
//    âge, série). Au-delà, le CPU du plan gratuit en pâtit et rien n'y gagne ;
//  - DESCRIPTION_AFFICHAGE (4 000) : le texte de la fiche, renvoyé seulement
//    pour les sorties du top (voir `pourAffichage`).

export const DESCRIPTION_SCORING = 1200;
export const DESCRIPTION_AFFICHAGE = 4000;

const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô',
  ucirc: 'û', icirc: 'î', iuml: 'ï', euml: 'ë', ugrave: 'ù', oelig: 'œ',
};

function decoder(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? ' ');
}

/**
 * HTML (ou texte) → paragraphes séparés par « \n », espaces resserrés,
 * lignes vides retirées. Les puces de liste deviennent « • ».
 */
export function texteLisible(html) {
  const brut = String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decoder(brut)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Coupe à `max` caractères sans couper de mot : en fin de phrase si elle
 * tombe dans le dernier tiers, sinon au dernier espace, avec « … ».
 */
export function couper(texte, max) {
  const t = String(texte || '');
  if (t.length <= max) return t;
  const debut = t.slice(0, max);
  const finPhrase = Math.max(debut.lastIndexOf('. '), debut.lastIndexOf('.\n'), debut.lastIndexOf('!'), debut.lastIndexOf('?'), debut.lastIndexOf('\n'));
  if (finPhrase > max * 0.66) return debut.slice(0, finPhrase + 1).trim();
  const espace = debut.lastIndexOf(' ');
  return `${debut.slice(0, espace > 0 ? espace : max).trim()}…`;
}

/**
 * Chapeau + texte long, sans doublon : beaucoup d'agendas répètent le chapeau
 * dans le texte long (Ouescrime : la dernière phrase).
 */
export function assembler(chapeau, long) {
  const c = texteLisible(chapeau);
  const l = texteLisible(long);
  if (!c) return l;
  if (!l) return c;
  const cle = c.slice(0, 60).toLowerCase();
  return l.toLowerCase().includes(cle) ? l : `${c}\n${l}`;
}

/**
 * Les deux champs d'une source : `description` (coupée pour le scoring) et,
 * si le texte est plus long, `descriptionComplete` (pour la fiche).
 */
export function champsDescription(texte) {
  const t = String(texte || '');
  return {
    description: couper(t, DESCRIPTION_SCORING),
    ...(t.length > DESCRIPTION_SCORING ? { descriptionComplete: couper(t, DESCRIPTION_AFFICHAGE) } : {}),
  };
}

/** Sortie renvoyée à l'app : le texte complet remplace l'extrait de scoring. */
export function pourAffichage(ev) {
  if (!ev || !ev.descriptionComplete) return ev;
  const { descriptionComplete, ...reste } = ev;
  return { ...reste, description: descriptionComplete };
}
