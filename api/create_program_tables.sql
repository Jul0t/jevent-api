CREATE TABLE IF NOT EXISTS program_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,

  title TEXT NOT NULL,
  description_markdown TEXT NOT NULL DEFAULT '',

  category TEXT NOT NULL DEFAULT 'other'
    CHECK (
      category IN (
        'gaming',
        'talk',
        'challenge',
        'creative',
        'charity',
        'community',
        'special',
        'other'
      )
    ),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'published',
        'cancelled'
      )
    ),

  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,

  event_day INTEGER NOT NULL
    CHECK (event_day IN (1, 2, 3)),

  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  external_url TEXT,

  created_by_user_id INTEGER NOT NULL,

  published_at TEXT,
  cancelled_at TEXT,
  cancelled_reason TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS program_entry_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_entry_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,

  is_primary INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,

  added_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (program_entry_id)
    REFERENCES program_entries(id)
    ON DELETE CASCADE,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (added_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT,

  UNIQUE(program_entry_id, creator_id)
);

CREATE INDEX IF NOT EXISTS
idx_program_entries_public
ON program_entries (
  status,
  starts_at,
  ends_at
);

CREATE INDEX IF NOT EXISTS
idx_program_entries_day
ON program_entries (
  event_day,
  status,
  starts_at
);

CREATE INDEX IF NOT EXISTS
idx_program_participants_entry
ON program_entry_participants (
  program_entry_id,
  display_order
);

CREATE INDEX IF NOT EXISTS
idx_program_participants_creator
ON program_entry_participants (
  creator_id,
  program_entry_id
);