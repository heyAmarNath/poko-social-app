-- All timestamps are UTC epoch milliseconds (INTEGER).

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#6366f1',
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '[]',          -- JSON array of role keys
  email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  char_limit INTEGER,
  extra_fields TEXT NOT NULL DEFAULT '[]',   -- JSON [{key,label}]
  color TEXT NOT NULL DEFAULT '#64748b',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  handle TEXT NOT NULL,
  display_name TEXT,
  url TEXT,
  timezone TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_accounts_platform ON accounts(platform_id);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK (role IN ('manager','creative','writer')),
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  UNIQUE (account_id, role)
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES profiles(id),
  writer_id INTEGER REFERENCES profiles(id),
  creative_id INTEGER REFERENCES profiles(id),
  copy_due INTEGER,
  media_due INTEGER,
  notes TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_posts_writer ON posts(writer_id);
CREATE INDEX idx_posts_creative ON posts(creative_id);

CREATE TABLE post_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  body_override TEXT,
  extra TEXT NOT NULL DEFAULT '{}',          -- JSON values for platform extra_fields
  scheduled_at INTEGER,
  manager_id INTEGER REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'not_ready',
  posted_url TEXT,
  posted_at INTEGER,
  UNIQUE (post_id, account_id)
);
CREATE INDEX idx_targets_sched ON post_targets(scheduled_at);
CREATE INDEX idx_targets_status ON post_targets(status);
CREATE INDEX idx_targets_manager ON post_targets(manager_id);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('file','link')),
  r2_key TEXT,
  url TEXT,
  filename TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  uploaded_by INTEGER REFERENCES profiles(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_attach_post ON attachments(post_id);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES profiles(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_post ON comments(post_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,                               -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
