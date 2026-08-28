// Validation et nettoyage des entrées utilisateur. Retourne une chaîne
// d'erreur (français, montrable à l'utilisateur) ou null si OK.

/** Retire les caracteres de controle (sauf \n) et compacte les sauts de
 *  ligne en rafale. */
export function nettoyer(texte) {
  return String(texte || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validerPseudo(pseudo) {
  const p = nettoyer(pseudo);
  if (p.length < 2) return 'Le pseudo doit faire au moins 2 caractères.';
  if (p.length > 20) return 'Le pseudo doit faire au plus 20 caractères.';
  if (/https?:\/\//i.test(p)) return 'Pas de lien dans le pseudo.';
  return null;
}

export function validerTypePost(type) {
  return type === 'sortie' || type === 'entraide' ? null : 'Type de post inconnu.';
}

export function validerTextePost(texte) {
  const t = nettoyer(texte);
  if (t.length < 3) return 'Ton post est un peu court.';
  if (t.length > 600) return 'Maximum 600 caractères (on est entre papas, pas sur Medium).';
  return null;
}

export function validerCommentaire(texte) {
  const t = nettoyer(texte);
  if (t.length < 1) return 'Commentaire vide.';
  if (t.length > 300) return 'Maximum 300 caractères.';
  return null;
}
