CREATE TABLE creator_raffles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  creator_id INTEGER NOT NULL,

  title TEXT NOT NULL,

  description TEXT NOT NULL
    DEFAULT '',

  method TEXT NOT NULL
    CHECK (
      method IN (
        'ticket_per_euro',
        'highest_donor'
      )
    ),

  status TEXT NOT NULL
    DEFAULT 'countdown'
    CHECK (
      status IN (
        'countdown',
        'active',
        'drawing',
        'completed',
        'cancelled'
      )
    ),

  duration_minutes INTEGER NOT NULL
    CHECK (
      duration_minutes BETWEEN 1 AND 1440
    ),

  countdown_minutes INTEGER NOT NULL
    DEFAULT 0
    CHECK (
      countdown_minutes BETWEEN 0 AND 60
    ),

  starts_at TEXT NOT NULL,

  ends_at TEXT NOT NULL,

  completed_at TEXT,

  cancelled_at TEXT,

  created_by_user_id INTEGER NOT NULL,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
);

CREATE TABLE raffle_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  raffle_id INTEGER NOT NULL,

  donation_id INTEGER NOT NULL,

  user_id INTEGER,

  /*
   * Identifiant stable du participant :
   * user:12, donor:abc123, etc.
   */
  participant_key TEXT NOT NULL,

  donor_name TEXT,

  amount_cents INTEGER NOT NULL
    CHECK (amount_cents > 0),

  ticket_count INTEGER NOT NULL
    DEFAULT 0
    CHECK (ticket_count >= 0),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    raffle_id,
    donation_id
  ),

  FOREIGN KEY (raffle_id)
    REFERENCES creator_raffles(id)
    ON DELETE CASCADE,

  FOREIGN KEY (donation_id)
    REFERENCES interaction_donations(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE TABLE raffle_winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raffle_id INTEGER NOT NULL UNIQUE,

  raffle_entry_id INTEGER NOT NULL,

  participant_key TEXT NOT NULL,

  donor_name TEXT,

  user_id INTEGER,

  selected_by_user_id INTEGER NOT NULL,

  selected_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (raffle_id)
    REFERENCES creator_raffles(id)
    ON DELETE CASCADE,

  FOREIGN KEY (raffle_entry_id)
    REFERENCES raffle_entries(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  FOREIGN KEY (selected_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
);

/*
 * Une seule tombola en cours ou en attente
 * par créateur.
 */
CREATE UNIQUE INDEX
  creator_raffles_one_running
ON creator_raffles (
  creator_id
)
WHERE status IN (
  'countdown',
  'active',
  'drawing'
);

CREATE INDEX
  creator_raffles_creator_status
ON creator_raffles (
  creator_id,
  status,
  created_at
);

CREATE INDEX
  raffle_entries_raffle
ON raffle_entries (
  raffle_id,
  created_at
);

CREATE INDEX
  raffle_entries_participant
ON raffle_entries (
  raffle_id,
  participant_key
);