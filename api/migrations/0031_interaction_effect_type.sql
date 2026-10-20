PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

ALTER TABLE creator_interactions
RENAME TO creator_interactions_old;

CREATE TABLE creator_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',

  interaction_type TEXT NOT NULL DEFAULT 'image'
    CHECK (
      interaction_type IN (
        'image',
        'text',
        'code',
        'sound',
        'advanced',
        'effect'
      )
    ),

  cost_cents INTEGER NOT NULL DEFAULT 500
    CHECK (cost_cents >= 0),

  moderation_required INTEGER NOT NULL DEFAULT 1
    CHECK (moderation_required IN (0, 1)),

  visible INTEGER NOT NULL DEFAULT 1
    CHECK (visible IN (0, 1)),

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  config_json TEXT NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 100,

  opens_at TEXT,
  closes_at TEXT,

  created_by_user_id INTEGER,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (creator_id, slug),

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

INSERT INTO creator_interactions (
  id,
  public_id,
  creator_id,
  slug,
  title,
  description,
  interaction_type,
  cost_cents,
  moderation_required,
  visible,
  enabled,
  config_json,
  display_order,
  opens_at,
  closes_at,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT
  id,
  public_id,
  creator_id,
  slug,
  title,
  description,
  interaction_type,
  cost_cents,
  moderation_required,
  visible,
  enabled,
  config_json,
  display_order,
  opens_at,
  closes_at,
  created_by_user_id,
  created_at,
  updated_at
FROM creator_interactions_old;

DROP TABLE creator_interactions_old;

CREATE INDEX IF NOT EXISTS
  idx_creator_interactions_creator
ON creator_interactions (
  creator_id,
  visible,
  enabled,
  display_order
);

CREATE INDEX IF NOT EXISTS
  idx_creator_interactions_type
ON creator_interactions (
  interaction_type,
  visible,
  enabled
);

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;