// Mise en route d'un papa inconnu (spec § 5, étape 1) : deux infos, le
// prénom de l'enfant et son âge, rien d'autre. Extraction par règles ici ;
// l'IA du lot 2 prend le relais quand le message est trop libre.

import { normaliser } from './danger.js';

export const MESSAGE_ACCUEIL =
  'Salut ! Je suis le copilote de Papa Parfait 👋\n'
  + 'Crise à gérer, après-midi coincé à la maison, histoire du soir ou plan du week-end : je suis là.\n'
  + 'Pour commencer : *comment s\'appelle ton enfant, et quel âge a-t-il ?*';

export const MESSAGE_RELANCE =
  'Je n\'ai pas bien saisi 🙂 Écris-moi juste son prénom et son âge, par exemple : *Léo, 4 ans*.';

// Mots à majuscule qui ne sont jamais un prénom (début de phrase, politesse).
const PAS_UN_PRENOM = new Set([
  'il', 'elle', 'ma', 'mon', 'mes', 'mais', 'salut', 'bonjour', 'bonsoir', 'coucou', 'hello', 'je', 'j',
  'le', 'la', 'les', 'et', 'ans', 'an', 'mois', 'lui', 'papa', 'fille', 'fils', 'garcon', 'bebe', 'c', 'ok',
  'oui', 'non', 'merci', 'a', 'de', 'du', 'des', 'un', 'une', 'qui', 'enfant', 'petit', 'petite', 'aussi',
]);

const AGE_MAX_ANS = 12;

/**
 * Âge en mois tiré du texte : « 4 ans », « 2 ans et demi », « 18 mois », « 3 ans 1/2 ».
 * @returns {number|null}
 */
export function extraireAgeMois(texte) {
  const t = normaliser(texte);
  const mois = t.match(/(\d{1,2})\s*mois/);
  const ans = t.match(/(\d{1,2})\s*ans?\b(\s*(?:et demi|1\/2|½))?/);
  if (ans) {
    const total = Number(ans[1]) * 12 + (ans[2] ? 6 : 0);
    return Number(ans[1]) <= AGE_MAX_ANS ? total : null;
  }
  if (mois) return Number(mois[1]) <= AGE_MAX_ANS * 12 ? Number(mois[1]) : null;
  return null;
}

// Prénom composé : chaque partie prend sa majuscule (Anne-Sophie).
const capitaliser = (mot) => mot.split('-')
  .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
  .join('-');
const MOT = "[\\p{L}][\\p{L}-]{0,29}";

/** Prénom tiré du texte, ou null. */
export function extrairePrenom(texte) {
  const brut = String(texte || '').trim();
  // 1. Formule explicite : « il s'appelle Tom », « c'est Jade ».
  const explicite = brut.match(new RegExp(`(?:s['’]appelle|c['’]est|pr[ée]nom(?:\\s+est)?\\s*:?)\\s+(${MOT})`, 'iu'));
  if (explicite && !PAS_UN_PRENOM.has(normaliser(explicite[1]))) return capitaliser(explicite[1]);
  // 2. Premier mot à majuscule qui n'est pas un mot courant.
  for (const mot of brut.match(new RegExp(MOT, 'gu')) || []) {
    if (/^\p{Lu}/u.test(mot) && !PAS_UN_PRENOM.has(normaliser(mot))) return capitaliser(mot);
  }
  // 3. Tout en minuscules (« leo 4 ans ») : le premier mot avant le chiffre.
  const avantChiffre = normaliser(brut).match(/^([a-z][a-z-]{0,29})\W+\d/);
  if (avantChiffre && !PAS_UN_PRENOM.has(avantChiffre[1])) return capitaliser(avantChiffre[1]);
  return null;
}

/** Premier jour du mois de naissance (YYYY-MM-01) à partir d'un âge en mois. */
export function naissanceDepuisAge(ageMois, maintenant = new Date()) {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - ageMois, 1));
  return d.toISOString().slice(0, 10);
}

/** Âge lisible (« 18 mois », « 4 ans ») depuis la date de naissance. */
export function ageLisible(naissance, maintenant = new Date()) {
  const n = new Date(`${naissance}T00:00:00Z`);
  const mois = (maintenant.getUTCFullYear() - n.getUTCFullYear()) * 12 + maintenant.getUTCMonth() - n.getUTCMonth();
  if (mois < 24) return `${Math.max(0, mois)} mois`;
  return `${Math.floor(mois / 12)} ans`;
}

/**
 * @returns {{ prenom: string, naissance: string } | null}
 */
export function lireMiseEnRoute(texte, maintenant = new Date()) {
  const ageMois = extraireAgeMois(texte);
  const prenom = extrairePrenom(texte);
  if (ageMois === null || !prenom) return null;
  return { prenom, naissance: naissanceDepuisAge(ageMois, maintenant) };
}

export const messageBienvenue = (enfant, maintenant = new Date()) =>
  `C'est noté : ${enfant.prenom}, ${ageLisible(enfant.naissance, maintenant)} ✅\n`
  + 'Dis-moi ce qu\'il te faut : 🆘 une crise à gérer, 🏠 une activité à la maison (envoie une photo de ce que tu as), '
  + '🌙 l\'histoire du soir, ou 🗓️ le plan du week-end.';
