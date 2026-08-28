// Accès D1 — toutes les requêtes SQL du worker vivent ici. Les fonctions
// prennent `db` (binding env.DB) en premier argument pour rester testables
// (les routes sont testées avec un dépôt simulé ; le parcours complet est
// vérifié de bout en bout par le smoke test du workflow de déploiement).

function uuid() {
  return crypto.randomUUID();
}

/** Jeton d'accès opaque (l'identité tient au téléphone, pas à un e-mail). */
function nouveauJeton() {
  const octets = new Uint8Array(24);
  crypto.getRandomValues(octets);
  return [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
}

export async function creerPapa(db, { pseudo, ville, dept }) {
  const id = uuid();
  const jeton = nouveauJeton();
  // Numéro d'ordre pour le badge Fondateur (course bénigne acceptée en v1).
  const { total } = await db.prepare('SELECT COUNT(*) AS total FROM papas').first();
  const numero = (total || 0) + 1;
  await db.prepare(
    'INSERT INTO papas (id, pseudo, ville, dept, jeton, numero) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  ).bind(id, pseudo, ville || null, dept || null, jeton, numero).run();
  return { id, pseudo, ville: ville || null, dept: dept || null, jeton, numero };
}

export async function papaParJeton(db, jeton) {
  if (!jeton) return null;
  return await db.prepare(
    'SELECT id, pseudo, ville, dept, numero, banni FROM papas WHERE jeton = ?1',
  ).bind(jeton).first();
}

export async function postsRecents(db, papaId, depuisMinutes) {
  const { total } = await db.prepare(
    "SELECT COUNT(*) AS total FROM posts WHERE papa_id = ?1 AND cree_le > datetime('now', ?2)",
  ).bind(papaId, `-${depuisMinutes} minutes`).first();
  return total || 0;
}

export async function creerPost(db, { papaId, type, texte, ville, dept }) {
  const id = uuid();
  await db.prepare(
    'INSERT INTO posts (id, papa_id, type, texte, ville, dept) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  ).bind(id, papaId, type, texte, ville || null, dept || null).run();
  return { id };
}

/**
 * Fil : posts visibles, du plus récent au plus ancien, filtrés par
 * département si fourni, curseur `avant` (cree_le) pour la pagination.
 */
export async function listerFil(db, { dept, avant, papaId, limite = 30 }) {
  const { results } = await db.prepare(`
    SELECT p.id, p.type, p.texte, p.ville, p.dept, p.cree_le,
           pa.pseudo, pa.ville AS auteur_ville, pa.numero AS auteur_numero,
           (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS pouces,
           (SELECT COUNT(*) FROM commentaires c WHERE c.post_id = p.id AND c.masque = 0) AS nb_commentaires
    FROM posts p JOIN papas pa ON pa.id = p.papa_id
    WHERE p.masque = 0 AND pa.banni = 0
      AND (?1 IS NULL OR p.dept = ?1)
      AND (?2 IS NULL OR p.cree_le < ?2)
    ORDER BY p.cree_le DESC
    LIMIT ?3
  `).bind(dept || null, avant || null, limite).all();
  const posts = results || [];

  // Mes pouces sur les posts du lot (pour l'état du bouton côté app).
  if (papaId && posts.length) {
    const trous = posts.map((_, i) => `?${i + 2}`).join(', ');
    const { results: miens } = await db.prepare(
      `SELECT post_id FROM reactions WHERE papa_id = ?1 AND post_id IN (${trous})`,
    ).bind(papaId, ...posts.map((p) => p.id)).all();
    const aimes = new Set((miens || []).map((r) => r.post_id));
    for (const p of posts) p.mon_pouce = aimes.has(p.id) ? 1 : 0;
  }
  return posts;
}

export async function postParId(db, id) {
  return await db.prepare('SELECT id, papa_id, masque FROM posts WHERE id = ?1').bind(id).first();
}

/** Toggle du pouce. Retourne l'état final {aime, pouces}. */
export async function basculerReaction(db, postId, papaId) {
  const existante = await db.prepare(
    'SELECT 1 AS ok FROM reactions WHERE post_id = ?1 AND papa_id = ?2',
  ).bind(postId, papaId).first();
  if (existante) {
    await db.prepare('DELETE FROM reactions WHERE post_id = ?1 AND papa_id = ?2').bind(postId, papaId).run();
  } else {
    await db.prepare('INSERT INTO reactions (post_id, papa_id) VALUES (?1, ?2)').bind(postId, papaId).run();
  }
  const { total } = await db.prepare(
    'SELECT COUNT(*) AS total FROM reactions WHERE post_id = ?1',
  ).bind(postId).first();
  return { aime: !existante, pouces: total || 0 };
}

export async function listerCommentaires(db, postId) {
  const { results } = await db.prepare(`
    SELECT c.id, c.texte, c.cree_le, pa.pseudo, pa.ville AS auteur_ville, pa.numero AS auteur_numero
    FROM commentaires c JOIN papas pa ON pa.id = c.papa_id
    WHERE c.post_id = ?1 AND c.masque = 0 AND pa.banni = 0
    ORDER BY c.cree_le ASC
    LIMIT 100
  `).bind(postId).all();
  return results || [];
}

export async function creerCommentaire(db, { postId, papaId, texte }) {
  const id = uuid();
  await db.prepare(
    'INSERT INTO commentaires (id, post_id, papa_id, texte) VALUES (?1, ?2, ?3, ?4)',
  ).bind(id, postId, papaId, texte).run();
  return { id };
}

/**
 * Enregistre un signalement (un seul par papa et par cible) et retourne le
 * total de signaleurs distincts sur la cible.
 */
export async function signaler(db, { cibleType, cibleId, papaId, raison }) {
  await db.prepare(
    'INSERT OR IGNORE INTO signalements (cible_type, cible_id, papa_id, raison) VALUES (?1, ?2, ?3, ?4)',
  ).bind(cibleType, cibleId, papaId, raison || null).run();
  const { total } = await db.prepare(
    'SELECT COUNT(*) AS total FROM signalements WHERE cible_type = ?1 AND cible_id = ?2',
  ).bind(cibleType, cibleId).first();
  return total || 0;
}

export async function masquer(db, cibleType, cibleId) {
  const table = cibleType === 'post' ? 'posts' : 'commentaires';
  await db.prepare(`UPDATE ${table} SET masque = 1 WHERE id = ?1`).bind(cibleId).run();
}

export async function bannir(db, papaId) {
  await db.prepare('UPDATE papas SET banni = 1 WHERE id = ?1').bind(papaId).run();
}

/** Pour l'admin : les cibles signalées non encore masquées, avec compteurs. */
export async function listerSignalements(db) {
  const { results } = await db.prepare(`
    SELECT s.cible_type, s.cible_id, COUNT(*) AS signaleurs, MAX(s.cree_le) AS dernier,
           GROUP_CONCAT(s.raison, ' | ') AS raisons
    FROM signalements s
    GROUP BY s.cible_type, s.cible_id
    ORDER BY dernier DESC
    LIMIT 100
  `).all();
  return results || [];
}
