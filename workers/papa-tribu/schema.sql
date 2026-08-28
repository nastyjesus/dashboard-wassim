-- Schéma D1 de papa-tribu (idempotent : rejouable à chaque déploiement).

CREATE TABLE IF NOT EXISTS papas (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL,
  ville TEXT,
  dept TEXT,
  jeton TEXT NOT NULL UNIQUE,
  numero INTEGER,                 -- ordre d'inscription (badge Fondateur ≤ 100)
  banni INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  papa_id TEXT NOT NULL REFERENCES papas(id),
  type TEXT NOT NULL CHECK (type IN ('sortie', 'entraide')),
  texte TEXT NOT NULL,
  ville TEXT,
  dept TEXT,
  masque INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reactions (
  post_id TEXT NOT NULL REFERENCES posts(id),
  papa_id TEXT NOT NULL REFERENCES papas(id),
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, papa_id)
);

CREATE TABLE IF NOT EXISTS commentaires (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  papa_id TEXT NOT NULL REFERENCES papas(id),
  texte TEXT NOT NULL,
  masque INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signalements (
  cible_type TEXT NOT NULL CHECK (cible_type IN ('post', 'commentaire')),
  cible_id TEXT NOT NULL,
  papa_id TEXT NOT NULL REFERENCES papas(id),
  raison TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cible_type, cible_id, papa_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_fil ON posts (dept, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_commentaires_post ON commentaires (post_id, cree_le);
