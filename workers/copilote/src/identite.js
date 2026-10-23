// Identité WhatsApp : le numéro n'est jamais stocké en clair (spec § 7).
// On garde SHA-256(sel + numéro) pour retrouver le papa ; le numéro lui-même
// n'existe que le temps de répondre, il arrive avec chaque webhook.

/** Numéro au format international sans « + » ni espaces (format des webhooks Meta). */
export function normaliserNumero(numero) {
  const chiffres = String(numero || '').replace(/[^\d]/g, '');
  if (chiffres.startsWith('00')) return chiffres.slice(2);
  if (chiffres.startsWith('0') && chiffres.length === 10) return `33${chiffres.slice(1)}`;
  return chiffres;
}

/** Empreinte hexadécimale du numéro, salée par le secret WA_SEL. */
export async function hacherNumero(numero, sel) {
  if (!sel) throw new Error('WA_SEL manquant');
  const donnees = new TextEncoder().encode(`${sel}:${normaliserNumero(numero)}`);
  const empreinte = await crypto.subtle.digest('SHA-256', donnees);
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
