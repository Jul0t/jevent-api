CREATE TABLE creator_overlays_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,

  overlay_type TEXT NOT NULL
    CHECK (
      overlay_type IN (
        'raffle',
        'donations',
        'donation_bar',
        'donation_goals',
        'donation_qr',
        "donation_global"
      )
    ),

  access_token TEXT NOT NULL UNIQUE,

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER,

  token_rotated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (creator_id, overlay_type),

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

INSERT INTO creator_overlays_new
SELECT * FROM creator_overlays;

DROP TABLE creator_overlays;

ALTER TABLE creator_overlays_new
RENAME TO creator_overlays;

CREATE INDEX creator_overlays_creator
ON creator_overlays (
  creator_id,
  enabled
);

CREATE INDEX creator_overlays_type
ON creator_overlays (
  overlay_type,
  enabled
);