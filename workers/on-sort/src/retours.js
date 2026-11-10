// Retours « pas pour nous » — le papa écarte une sortie du top et dit pourquoi.
//
// Sans ça, impossible de savoir ce qui déçoit : le scoring se réglait à
// l'aveugle (constat du 10 novembre 2026 : 8 mauvaises sorties sur 15 dans le
// top de Bruz, découvertes à la main). Chaque retour dit quelle sortie, pour
// quel âge, à quelle distance et pour quel motif.
//
// Aucun identifiant de personne ni d'appareil : une sortie, un motif, une
// ville. Tout tient dans les métadonnées de la clé KV (≤ 1 Ko) : la liste se
// lit en une seule opération, sans un `get` par retour. Expire seul au bout
// de six mois.

export const MOTIFS = ['loin', 'age', 'interet', 'deja', 'autre'];
const TTL_SECONDES = 180 * 24 * 3600;
const PREFIXE = 'retour:';

const texte = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nombre = (v, min, max) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * Valide et range un retour. `{ok: false}` si le corps est inexploitable.
 * @param {{VOTES?: KVNamespace}} env
 * @param {object} corps `{cle, titre, motif, ville?, date?, age?, km?, origine?}`
 */
export async function enregistrerRetour(env, corps) {
  const motif = texte(corps?.motif, 20);
  const titre = texte(corps?.titre, 140);
  if (!MOTIFS.includes(motif) || titre.length < 2) return { ok: false };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(corps?.date || '') ? corps.date : null;
  const retour = {
    motif,
    titre,
    cle: texte(corps?.cle, 160) || null,
    origine: texte(corps?.origine, 30) || null,
    ville: texte(corps?.ville, 60) || null,
    date,
    age: nombre(corps?.age, 0, 12),
    km: nombre(corps?.km, 0, 500),
    le: new Date().toISOString(),
  };
  const nom = `${PREFIXE}${retour.le}:${crypto.randomUUID().slice(0, 8)}`;
  await env.VOTES.put(nom, '1', { metadata: retour, expirationTtl: TTL_SECONDES });
  return { ok: true };
}

/**
 * Les retours, du plus récent au plus ancien, et leur compte par motif.
 * @returns {Promise<{total: number, parMotif: Record<string, number>, recents: object[]}>}
 */
export async function listerRetours(env, combien = 100) {
  if (!env.VOTES) return { total: 0, parMotif: {}, recents: [] };
  const { keys } = await env.VOTES.list({ prefix: PREFIXE, limit: 1000 });
  const retours = keys.map((k) => k.metadata).filter(Boolean)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const parMotif = {};
  for (const r of retours) parMotif[r.motif] = (parMotif[r.motif] || 0) + 1;
  return { total: retours.length, parMotif, recents: retours.slice(0, combien) };
}
