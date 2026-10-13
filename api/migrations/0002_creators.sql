CREATE TABLE IF NOT EXISTS creators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,

  twitch_id TEXT NOT NULL UNIQUE,
  twitch_login TEXT NOT NULL,
  twitch_display_name TEXT NOT NULL,
  twitch_profile_image_url TEXT,

  streamlabs_member_id TEXT,
  donation_url TEXT,

  display_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,

  claimed_by_user_id INTEGER,
  claimed_at TEXT,
  onboarding_completed_at TEXT,

  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (claimed_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_creators_twitch_id
ON creators(twitch_id);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_creators_slug
ON creators(slug);

CREATE INDEX IF NOT EXISTS
idx_creators_visibility
ON creators(active, archived, display_order);