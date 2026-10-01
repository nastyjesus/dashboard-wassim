-- Backlink Radar — schéma D1 idempotent, rejoué à chaque déploiement.

CREATE TABLE IF NOT EXISTS clients (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  domain            TEXT NOT NULL,
  sector            TEXT,
  is_local          INTEGER NOT NULL DEFAULT 0,
  weights_json      TEXT,
  authority_source  TEXT NOT NULL DEFAULT 'semrush',
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitors (
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,
  PRIMARY KEY (client_id, domain)
);

CREATE TABLE IF NOT EXISTS imports (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,
  filename     TEXT,
  row_count    INTEGER NOT NULL,
  created      INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  skipped      INTEGER NOT NULL DEFAULT 0,
  imported_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id                  TEXT PRIMARY KEY,
  client_id           TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain              TEXT NOT NULL,
  method              TEXT NOT NULL,
  sample_url          TEXT,
  semrush_as          INTEGER,
  ahrefs_dr           REAL,
  competitors_linked  INTEGER,
  competitors_total   INTEGER,
  score               REAL,
  score_detail_json   TEXT,
  status              TEXT NOT NULL DEFAULT 'a_contacter',
  contact_note        TEXT,
  next_followup_at    TEXT,
  link_url            TEXT,
  last_check_result   TEXT,
  last_checked_at     TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (client_id, domain, method)
);
CREATE INDEX IF NOT EXISTS idx_opp_client_status ON opportunities (client_id, status);
CREATE INDEX IF NOT EXISTS idx_opp_followup ON opportunities (status, next_followup_at);

CREATE TABLE IF NOT EXISTS link_checks (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  checked_at      TEXT NOT NULL,
  http_status     INTEGER,
  result          TEXT NOT NULL,
  rel             TEXT,
  detail          TEXT
);
CREATE INDEX IF NOT EXISTS idx_checks_opp ON link_checks (opportunity_id, checked_at);

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  at              TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_opp ON events (opportunity_id, at);
