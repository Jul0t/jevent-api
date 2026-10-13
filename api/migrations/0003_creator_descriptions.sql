CREATE TABLE IF NOT EXISTS creator_profile_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  creator_id INTEGER NOT NULL,

  revision_number INTEGER NOT NULL,

  markdown_content TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'pending',
        'approved',
        'rejected',
        'superseded'
      )
    ),

  submitted_by_user_id INTEGER NOT NULL,

  reviewed_by_user_id INTEGER,

  moderation_note TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  submitted_at TEXT,

  reviewed_at TEXT,

  published_at TEXT,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (submitted_by_user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (reviewed_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  UNIQUE (
    creator_id,
    revision_number
  )
);

CREATE INDEX IF NOT EXISTS
idx_creator_profile_revisions_creator
ON creator_profile_revisions (
  creator_id,
  revision_number
);

CREATE INDEX IF NOT EXISTS
idx_creator_profile_revisions_status
ON creator_profile_revisions (
  status,
  submitted_at
);