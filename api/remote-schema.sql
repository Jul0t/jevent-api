PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    twitch_id TEXT NOT NULL UNIQUE,
    twitch_login TEXT NOT NULL COLLATE NOCASE,
    twitch_display_name TEXT NOT NULL,
    twitch_profile_image_url TEXT,

    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),

    onboarding_completed INTEGER NOT NULL DEFAULT 0
        CHECK (onboarding_completed IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, disabled_at TEXT);
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,

    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ip_address TEXT, user_agent TEXT, last_seen_at TEXT,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);
CREATE TABLE roles (
    role_key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);
CREATE TABLE user_roles (
    user_id INTEGER NOT NULL,
    role_key TEXT NOT NULL,

    granted_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT, granted_at TEXT,

    PRIMARY KEY (user_id, role_key),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (role_key)
        REFERENCES roles(role_key),

    FOREIGN KEY (granted_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE creators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    owner_user_id INTEGER,
    twitch_id TEXT NOT NULL UNIQUE,
    twitch_login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    twitch_display_name TEXT NOT NULL,
    twitch_profile_image_url TEXT,

    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,

    banner_storage_key TEXT,

    public_description_markdown TEXT,
    public_description_updated_at TEXT,

    streamlabs_member_id TEXT UNIQUE,
    donation_url TEXT,

    display_order INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'active',
                'hidden',
                'archived'
            )
        ),

    validation_bypass INTEGER NOT NULL DEFAULT 0
        CHECK (validation_bypass IN (0, 1)),

    first_login_completed INTEGER NOT NULL DEFAULT 0
        CHECK (first_login_completed IN (0, 1)),

    created_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, archived INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, public_id TEXT, claimed_by_user_id INTEGER, claimed_at TEXT, onboarding_completed_at TEXT, public_description_revision_id INTEGER, description_moderation_bypass INTEGER NOT NULL DEFAULT 0,

    FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE creator_description_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    creator_id INTEGER NOT NULL,
    submitted_by_user_id INTEGER NOT NULL,

    original_markdown TEXT NOT NULL,
    moderated_markdown TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'approved',
                'rejected',
                'superseded'
            )
        ),

    moderator_note TEXT,
    reviewed_by_user_id INTEGER,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE,

    FOREIGN KEY (submitted_by_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (reviewed_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE creator_social_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    creator_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    label TEXT,

    display_order INTEGER NOT NULL DEFAULT 0,
    is_visible INTEGER NOT NULL DEFAULT 1
        CHECK (is_visible IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE
);
CREATE TABLE creator_staff_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    creator_id INTEGER NOT NULL,
    proposed_user_id INTEGER,

    proposed_twitch_id TEXT,
    proposed_twitch_login TEXT NOT NULL COLLATE NOCASE,

    staff_type TEXT NOT NULL
        CHECK (
            staff_type IN (
                'creator_moderator',
                'creator_delegate'
            )
        ),

    reason TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'approved',
                'rejected',
                'revoked'
            )
        ),

    proposed_by_user_id INTEGER NOT NULL,
    reviewed_by_user_id INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    reviewer_note TEXT,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE,

    FOREIGN KEY (proposed_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    FOREIGN KEY (proposed_by_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (reviewed_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE creator_staff (
    creator_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    staff_type TEXT NOT NULL
        CHECK (
            staff_type IN (
                'creator_moderator',
                'creator_delegate'
            )
        ),

    approved_request_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (creator_id, user_id, staff_type),

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (approved_request_id)
        REFERENCES creator_staff_requests(id)
        ON DELETE SET NULL
);
CREATE TABLE schedule_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,
    description_markdown TEXT,

    starts_at TEXT NOT NULL,
    ends_at TEXT,

    primary_creator_id INTEGER,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'cancelled'
            )
        ),

    image_storage_key TEXT,

    created_by_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (primary_creator_id)
        REFERENCES creators(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);
CREATE TABLE schedule_participants (
    schedule_entry_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,

    PRIMARY KEY (schedule_entry_id, creator_id),

    FOREIGN KEY (schedule_entry_id)
        REFERENCES schedule_entries(id)
        ON DELETE CASCADE,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE
);
CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    scope_type TEXT NOT NULL
        CHECK (
            scope_type IN (
                'global',
                'creator',
                'shared'
            )
        ),

    creator_id INTEGER,

    title TEXT NOT NULL,
    description_markdown TEXT,
    image_storage_key TEXT,

    target_amount_cents INTEGER NOT NULL
        CHECK (target_amount_cents > 0),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'active',
                'reached',
                'completed',
                'cancelled'
            )
        ),

    is_visible INTEGER NOT NULL DEFAULT 1
        CHECK (is_visible IN (0, 1)),

    display_order INTEGER NOT NULL DEFAULT 0,

    reached_at TEXT,
    completed_at TEXT,

    created_by_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);
CREATE TABLE goal_creators (
    goal_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,

    PRIMARY KEY (goal_id, creator_id),

    FOREIGN KEY (goal_id)
        REFERENCES goals(id)
        ON DELETE CASCADE,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE
);
CREATE TABLE site_features (
    feature_key TEXT PRIMARY KEY,

    title TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    target_url TEXT,

    status TEXT NOT NULL DEFAULT 'closed'
        CHECK (
            status IN (
                'draft',
                'closed',
                'open',
                'archived'
            )
        ),

    display_order INTEGER NOT NULL DEFAULT 0,

    opens_at TEXT,
    closes_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE event_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT,
    updated_by_user_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    actor_user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,

    old_value_json TEXT,
    new_value_json TEXT,

    ip_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (actor_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE streamlabs_fundraisers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    creator_id INTEGER NOT NULL UNIQUE,
    member_id TEXT UNIQUE,
    donation_url TEXT NOT NULL,

    mapping_status TEXT NOT NULL DEFAULT 'manual'
        CHECK (
            mapping_status IN (
                'automatic',
                'manual',
                'unverified'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE CASCADE
);
CREATE TABLE donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    external_id TEXT NOT NULL UNIQUE,
    creator_id INTEGER,
    fundraiser_id INTEGER,

    donor_display_name TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    message TEXT,

    claim_code TEXT,

    assignment_status TEXT NOT NULL DEFAULT 'unassigned'
        CHECK (
            assignment_status IN (
                'automatic',
                'manual',
                'unassigned'
            )
        ),

    donated_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE SET NULL,

    FOREIGN KEY (fundraiser_id)
        REFERENCES streamlabs_fundraisers(id)
        ON DELETE SET NULL
);
CREATE TABLE credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,

    transaction_type TEXT NOT NULL
        CHECK (
            transaction_type IN (
                'donation',
                'upload',
                'refund',
                'manual_adjustment'
            )
        ),

    donation_id INTEGER,
    creator_id INTEGER,

    note TEXT,
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (donation_id)
        REFERENCES donations(id)
        ON DELETE SET NULL,

    FOREIGN KEY (creator_id)
        REFERENCES creators(id)
        ON DELETE SET NULL,

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
CREATE TABLE creator_members (id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL, user_id INTEGER NOT NULL, member_role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TEXT, revoked_at TEXT, rejected_at TEXT, approved_by_user_id INTEGER, proposed_by_user_id INTEGER, public_id TEXT, FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE creator_profile_revisions (
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
CREATE TABLE program_entries (
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
CREATE TABLE program_entry_participants (
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
DELETE FROM sqlite_sequence;
CREATE UNIQUE INDEX idx_users_twitch_login
ON users(twitch_login COLLATE NOCASE);
CREATE INDEX idx_sessions_user
ON sessions(user_id);
CREATE INDEX idx_sessions_expires
ON sessions(expires_at);
CREATE INDEX idx_creators_status_order
ON creators(status, display_order);
CREATE INDEX idx_description_revisions_status
ON creator_description_revisions(status, submitted_at);
CREATE INDEX idx_creator_social_links
ON creator_social_links(creator_id, display_order);
CREATE INDEX idx_audit_logs_created
ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity
ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_creator_members_user_status ON creator_members(user_id, status);
CREATE INDEX idx_creator_members_creator_status ON creator_members(creator_id, status);
CREATE UNIQUE INDEX idx_creators_twitch_id ON creators(twitch_id);
CREATE UNIQUE INDEX idx_creators_slug ON creators(slug);
CREATE INDEX idx_creators_visibility ON creators(active, archived, display_order);
CREATE UNIQUE INDEX idx_creator_members_public_id ON creator_members(public_id);
CREATE INDEX idx_creator_profile_revisions_creator
ON creator_profile_revisions (
  creator_id,
  revision_number
);
CREATE INDEX idx_creator_profile_revisions_status
ON creator_profile_revisions (
  status,
  submitted_at
);
CREATE INDEX idx_program_entries_public
ON program_entries (
  status,
  starts_at,
  ends_at
);
CREATE INDEX idx_program_entries_day
ON program_entries (
  event_day,
  status,
  starts_at
);
CREATE INDEX idx_program_participants_entry
ON program_entry_participants (
  program_entry_id,
  display_order
);
CREATE INDEX idx_program_participants_creator
ON program_entry_participants (
  creator_id,
  program_entry_id
);
