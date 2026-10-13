CREATE TABLE creator_donation_alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  creator_id INTEGER NOT NULL,

  name TEXT NOT NULL,

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  condition_type TEXT NOT NULL DEFAULT 'default'
    CHECK (
      condition_type IN (
        'default',
        'exact',
        'minimum',
        'range'
      )
    ),

  minimum_amount_cents INTEGER
    CHECK (
      minimum_amount_cents IS NULL
      OR minimum_amount_cents >= 0
    ),

  maximum_amount_cents INTEGER
    CHECK (
      maximum_amount_cents IS NULL
      OR maximum_amount_cents >= 0
    ),

  selection_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (
      selection_mode IN (
        'fixed',
        'random'
      )
    ),

  text_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (text_enabled IN (0, 1)),

  text_template TEXT NOT NULL
    DEFAULT '{name} a donné {amount}',

  text_delay_ms INTEGER NOT NULL DEFAULT 0
    CHECK (
      text_delay_ms BETWEEN 0 AND 60000
    ),

  alert_delay_ms INTEGER NOT NULL DEFAULT 0
    CHECK (
      alert_delay_ms BETWEEN 0 AND 60000
    ),

  display_duration_ms INTEGER NOT NULL DEFAULT 7000
    CHECK (
      display_duration_ms BETWEEN 1000 AND 60000
    ),

  font_family TEXT NOT NULL DEFAULT 'Inter',

  font_size_px INTEGER NOT NULL DEFAULT 42
    CHECK (
      font_size_px BETWEEN 12 AND 200
    ),

  font_weight INTEGER NOT NULL DEFAULT 700
    CHECK (
      font_weight IN (
        100,
        200,
        300,
        400,
        500,
        600,
        700,
        800,
        900
      )
    ),

  text_transform TEXT NOT NULL DEFAULT 'none'
    CHECK (
      text_transform IN (
        'none',
        'uppercase',
        'lowercase'
      )
    ),

  text_position TEXT NOT NULL DEFAULT 'bottom'
    CHECK (
      text_position IN (
        'top',
        'center',
        'bottom'
      )
    ),

  animation TEXT NOT NULL DEFAULT 'fade'
    CHECK (
      animation IN (
        'none',
        'fade',
        'slide',
        'zoom',
        'bounce'
      )
    ),

  sound_volume INTEGER NOT NULL DEFAULT 80
    CHECK (
      sound_volume BETWEEN 0 AND 100
    ),

  priority INTEGER NOT NULL DEFAULT 100,

  created_by_user_id INTEGER,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE INDEX creator_donation_alert_rules_creator
ON creator_donation_alert_rules (
  creator_id,
  enabled,
  priority
);

CREATE TABLE creator_donation_alert_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  rule_id INTEGER NOT NULL,

  name TEXT NOT NULL,

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  image_storage_key TEXT,

  sound_storage_key TEXT,

  video_storage_key TEXT,

  media_type TEXT NOT NULL DEFAULT 'none'
    CHECK (
      media_type IN (
        'none',
        'image',
        'video'
      )
    ),

  weight INTEGER NOT NULL DEFAULT 1
    CHECK (weight BETWEEN 1 AND 1000),

  display_order INTEGER NOT NULL DEFAULT 100,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id)
    REFERENCES creator_donation_alert_rules(id)
    ON DELETE CASCADE
);

CREATE INDEX creator_donation_alert_variants_rule
ON creator_donation_alert_variants (
  rule_id,
  enabled,
  display_order
);