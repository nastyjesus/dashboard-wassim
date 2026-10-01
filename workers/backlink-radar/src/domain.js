// Normalisation des domaines : c'est la clé de dédoublonnage des opportunités
// et la base de la vérification des liens. Minuscules, sans protocole, sans
// « www. », sans port ni chemin. Les autres sous-domaines restent distincts
// (blog.x.fr ≠ x.fr), comme dans les exports Semrush / Ahrefs.

/**
 * @param {unknown} input  domaine nu ou URL
 * @returns {string|null}  domaine normalisé, ou null si illisible
 */
export function normalizeDomain(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase();
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s}`;
  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  if (!host.includes('.')) return null;
  return host;
}

/**
 * Vrai si `host` est le domaine du client ou l'un de ses sous-domaines :
 * un lien vers blog.client.fr compte comme un lien vers client.fr.
 */
export function belongsTo(host, clientDomain) {
  const h = normalizeDomain(host);
  const c = normalizeDomain(clientDomain);
  if (!h || !c) return false;
  return h === c || h.endsWith(`.${c}`);
}

/** Slug d'identifiant client à partir d'un nom. */
export function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
