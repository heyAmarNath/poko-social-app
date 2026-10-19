-- Accounts now have a simple list of handlers (members) instead of per-job rules.
CREATE TABLE account_handlers (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  PRIMARY KEY (account_id, profile_id)
);
CREATE INDEX idx_handlers_profile ON account_handlers(profile_id);
INSERT OR IGNORE INTO account_handlers (account_id, profile_id)
  SELECT DISTINCT account_id, profile_id FROM assignment_rules;
DROP TABLE assignment_rules;

-- Recurring post templates, created by admins. Each active template turns into a
-- draft post on every chosen weekday, a couple of weeks ahead.
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  notes TEXT,
  weekdays TEXT NOT NULL DEFAULT '[]',       -- JSON ISO weekdays: 1 = Monday ... 7 = Sunday
  time TEXT NOT NULL DEFAULT '10:00',        -- HH:MM in `timezone`
  timezone TEXT NOT NULL DEFAULT 'UTC',
  starts_on TEXT NOT NULL,                   -- YYYY-MM-DD
  ends_on TEXT,                              -- YYYY-MM-DD, optional
  writer_id INTEGER REFERENCES profiles(id),
  creative_id INTEGER REFERENCES profiles(id),
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,                        -- soft delete, so posts made from it keep the link
  created_by INTEGER REFERENCES profiles(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE template_accounts (
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  PRIMARY KEY (template_id, account_id)
);

-- One row per date a template has produced a post, so generation never duplicates.
CREATE TABLE template_runs (
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  run_date TEXT NOT NULL,                    -- YYYY-MM-DD in the template's timezone
  post_id INTEGER REFERENCES posts(id),
  PRIMARY KEY (template_id, run_date)
);

ALTER TABLE posts ADD COLUMN template_id INTEGER REFERENCES templates(id);
CREATE INDEX idx_posts_template ON posts(template_id);
