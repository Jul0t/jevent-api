CREATE TABLE IF NOT EXISTS overlay_donation_cursors (
  overlay_id INTEGER PRIMARY KEY,

  last_donation_id INTEGER NOT NULL
    DEFAULT 0,

  initialized_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (overlay_id)
    REFERENCES creator_overlays(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS overlay_donation_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  overlay_id INTEGER NOT NULL,

  donation_id INTEGER NOT NULL,

  status TEXT NOT NULL
    DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'claimed',
        'delivered'
      )
    ),

  claim_token TEXT,

  claimed_at TEXT,

  delivered_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    overlay_id,
    donation_id
  ),

  FOREIGN KEY (overlay_id)
    REFERENCES creator_overlays(id)
    ON DELETE CASCADE,

  FOREIGN KEY (donation_id)
    REFERENCES interaction_donations(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS
  overlay_donation_deliveries_queue
ON overlay_donation_deliveries (
  overlay_id,
  status,
  id
);
