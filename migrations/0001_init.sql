-- The whole schema. All timestamps are UTC epoch milliseconds (INTEGER).
-- Starting data (platforms and topics) is in scripts/seed.sql.

-- People. They sign in with the Google account whose email is on their profile; nobody else gets in.
-- Everyone does content work; admins also manage people, accounts, topics and platforms.
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,                        -- their Google account, lowercase
  avatar_color TEXT NOT NULL DEFAULT '#6366f1',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1, -- bumped to sign out every session of the profile
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_profiles_email ON profiles(email COLLATE NOCASE);

CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,                   -- picks the brand icon, e.g. "x"
  name TEXT NOT NULL,
  char_limit INTEGER,
  color TEXT NOT NULL DEFAULT '#64748b',
  visible INTEGER NOT NULL DEFAULT 1,         -- admins can hide a platform everywhere
  sort INTEGER NOT NULL DEFAULT 0
);

-- What people call an "account": a brand or person, e.g. Poko, with a profile per platform.
CREATE TABLE brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  timezone TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_brands_name ON brands(name COLLATE NOCASE) WHERE deleted_at IS NULL;

-- One platform profile of a brand, e.g. Poko on X. Its manager posts to it by default.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  url TEXT NOT NULL,                          -- the profile link
  handle TEXT NOT NULL,                       -- worked out from the link, e.g. @poko
  manager_id INTEGER REFERENCES profiles(id),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_accounts_brand ON accounts(brand_id);

-- A kind of post the team makes, e.g. Feature Promotion, with starter text for new posts.
CREATE TABLE topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_topics_name ON topics(name COLLATE NOCASE) WHERE deleted_at IS NULL;

-- A post: topic, title, default time and notes. What goes out is in its versions, and its status
-- follows them: completed when all are, working once any has started, not ready otherwise.
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  topic_id INTEGER REFERENCES topics(id),
  status TEXT NOT NULL DEFAULT 'not_ready' CHECK (status IN ('not_ready', 'working', 'completed')),
  scheduled_at INTEGER,                       -- the default time for its versions
  created_by INTEGER REFERENCES profiles(id),
  version INTEGER NOT NULL DEFAULT 1,         -- bumped on every save, to catch two people editing at once
  deleted_at INTEGER,                         -- removed for good 30 days later
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_posts_status_time ON posts(status, scheduled_at);
CREATE INDEX idx_posts_topic ON posts(topic_id, status);
CREATE INDEX idx_posts_time ON posts(scheduled_at);
CREATE INDEX idx_posts_deleted ON posts(deleted_at) WHERE deleted_at IS NOT NULL;

-- One version of a post per account: its own text, media links, people, time, status and live link.
CREATE TABLE post_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  body TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '[]',           -- JSON [{url, label}]
  writer_id INTEGER REFERENCES profiles(id),
  creative_id INTEGER REFERENCES profiles(id),
  poster_id INTEGER REFERENCES profiles(id),
  scheduled_at INTEGER,                       -- null: the post's time
  status TEXT NOT NULL DEFAULT 'not_ready' CHECK (status IN ('not_ready', 'working', 'completed')),
  posted_url TEXT,
  UNIQUE (post_id, account_id)
);
CREATE INDEX idx_versions_time ON post_versions(scheduled_at);
CREATE INDEX idx_versions_writer ON post_versions(writer_id, status);
CREATE INDEX idx_versions_creative ON post_versions(creative_id, status);
CREATE INDEX idx_versions_poster ON post_versions(poster_id, status);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES profiles(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_post ON comments(post_id);

-- Who changed what, for looking into problems. Kept 90 days.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,                                -- JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_time ON audit_log(created_at);
