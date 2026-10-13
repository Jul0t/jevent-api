CREATE TABLE overlay_donation_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  overlay_id INTEGER NOT NULL,

  created_by_user_id INTEGER,

  donor_name TEXT NOT NULL
    DEFAULT 'Donateur test',

  donation_message TEXT NOT NULL
    DEFAULT '',

  amount_cents INTEGER NOT NULL
    DEFAULT 1000
    CHECK (amount_cents > 0),

  currency TEXT NOT NULL
    DEFAULT 'EUR',

  rule_public_id TEXT,

  variant_public_id TEXT,

  status TEXT NOT NULL
    DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'claimed',
        'completed',
        'cancelled'
      )
    ),

  claim_token TEXT,

  claimed_at TEXT,

  completed_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (overlay_id)
    REFERENCES creator_overlays(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE INDEX overlay_donation_tests_queue
ON overlay_donation_tests (
  overlay_id,
  status,
  created_at
);