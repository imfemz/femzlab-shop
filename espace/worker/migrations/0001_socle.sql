-- 0001_socle.sql — espace membre FemzLab (spec §5, périmètre Plan 1)
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  display_name TEXT,
  name         TEXT,
  avatar_key   TEXT,
  country      TEXT,
  city         TEXT,
  lat          REAL,
  lon          REAL,
  socials      TEXT,            -- JSON {ig,tt,yt}
  reels        TEXT,            -- JSON [{url,thumb_key}] (max 3)
  lang         TEXT,
  founder      INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 0,
  dms_open     INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0,
  deleted_at   TEXT
);
CREATE INDEX idx_users_visible ON users(visible);

CREATE TABLE identities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  provider     TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
  provider_id  TEXT NOT NULL,
  email        TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_id)
);
CREATE INDEX idx_identities_user ON identities(user_id);

CREATE TABLE user_emails (
  email       TEXT PRIMARY KEY,   -- toujours en minuscules
  user_id     INTEGER NOT NULL REFERENCES users(id),
  verified_by TEXT NOT NULL CHECK (verified_by IN ('oauth', 'admin')),
  added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_emails_user ON user_emails(user_id);

CREATE TABLE dms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user  INTEGER NOT NULL REFERENCES users(id),
  to_user    INTEGER NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_dms_from ON dms(from_user);
CREATE INDEX idx_dms_to   ON dms(to_user);

CREATE TABLE blocks (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  blocked_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE rate_events (
  user_id INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  at      INTEGER NOT NULL           -- epoch ms
);
CREATE INDEX idx_rate_events ON rate_events(user_id, kind, at);

