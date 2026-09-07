-- 0002_achats.sql — Plan 2 : achats Podia, rattachement, demandes de liaison
CREATE TABLE purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,                  -- toujours en minuscules
  user_id      INTEGER REFERENCES users(id),   -- NULL tant que non rattaché
  product      TEXT NOT NULL,                  -- nom canonique (ex. "MetaVision")
  source       TEXT NOT NULL CHECK (source IN ('checkout', 'import', 'admin')),
  purchased_at TEXT NOT NULL,
  external_ref TEXT,
  UNIQUE (email, product, purchased_at)
);
CREATE INDEX idx_purchases_email ON purchases(email);
CREATE INDEX idx_purchases_user  ON purchases(user_id);

CREATE TABLE link_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  email      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  token_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX idx_link_requests_user ON link_requests(user_id);
