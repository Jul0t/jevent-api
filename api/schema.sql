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
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, archived INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, public_id TEXT, claimed_by_user_id INTEGER, claimed_at TEXT, onboarding_completed_at TEXT, public_description_revision_id INTEGER, description_moderation_bypass INTEGER NOT NULL DEFAULT 0, streamlabs_goal_url TEXT, hide_donation_details_until_overlay INTEGER NOT NULL DEFAULT 1,

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
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, public_id TEXT,

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, goal_id INTEGER
REFERENCES goals(id)
ON DELETE SET NULL, goal_condition TEXT NOT NULL DEFAULT 'always'
CHECK (
  goal_condition IN (
    'always',
    'reached',
    'not_reached'
  )
), fallback_enabled INTEGER NOT NULL DEFAULT 0
CHECK (fallback_enabled IN (0, 1)), fallback_title TEXT, fallback_description_markdown TEXT, fallback_category TEXT, fallback_external_url TEXT,

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
CREATE TABLE twitch_chat_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL,
  stat_date TEXT NOT NULL,
  messages_count INTEGER NOT NULL DEFAULT 0,
  emotes_count INTEGER NOT NULL DEFAULT 0,

  UNIQUE (creator_id, stat_date),

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE
);
CREATE TABLE twitch_eventsub_events (
  message_id TEXT PRIMARY KEY,
  broadcaster_user_id TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE twitch_eventsub_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  creator_id INTEGER NOT NULL,
  broadcaster_user_id TEXT NOT NULL,
  subscription_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE
);
CREATE TABLE twitch_chat_connections (
  creator_id INTEGER PRIMARY KEY,

  twitch_user_id TEXT NOT NULL UNIQUE,

  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,

  token_expires_at TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (
      status IN (
        'connected',
        'expired',
        'revoked',
        'error'
      )
    ),

  last_error TEXT,

  connected_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE
);
CREATE TABLE twitch_chat_oauth_states (
  state TEXT PRIMARY KEY,

  creator_id INTEGER NOT NULL,

  expires_at TEXT NOT NULL,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE
);
CREATE TABLE admin_dashboard_preferences (
  user_id INTEGER PRIMARY KEY,

  layout_json TEXT NOT NULL
    DEFAULT '[]',

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);
CREATE TABLE viewer_chat_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  event_key TEXT NOT NULL
    DEFAULT 'jevent-2026',

  viewer_twitch_id TEXT NOT NULL,

  viewer_twitch_login TEXT,

  viewer_twitch_display_name TEXT,

  creator_id INTEGER NOT NULL,

  stat_date TEXT NOT NULL,

  /*
   * 1, 2 ou 3 pendant le JEvent.
   * Le 29 octobre avant 4 h appartient au jour 3.
   */
  event_day INTEGER,

  messages_count INTEGER NOT NULL
    DEFAULT 0
    CHECK (messages_count >= 0),

  emotes_count INTEGER NOT NULL
    DEFAULT 0
    CHECK (emotes_count >= 0),

  first_seen_at TEXT,

  last_seen_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    event_key,
    viewer_twitch_id,
    creator_id,
    stat_date
  ),

  CHECK (
    event_day IS NULL
    OR event_day BETWEEN 1 AND 3
  ),

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE
);
CREATE TABLE profile_badges (
  badge_key TEXT PRIMARY KEY,

  label TEXT NOT NULL,

  description TEXT NOT NULL,

  icon_key TEXT NOT NULL,

  event_key TEXT,

  automatic INTEGER NOT NULL
    DEFAULT 1
    CHECK (automatic IN (0, 1)),

  rule_key TEXT,

  threshold INTEGER,

  active INTEGER NOT NULL
    DEFAULT 1
    CHECK (active IN (0, 1)),

  display_order INTEGER NOT NULL
    DEFAULT 100,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
, requirements_hidden INTEGER
NOT NULL DEFAULT 0
CHECK (requirements_hidden IN (0, 1)), acquisition_mode TEXT
NOT NULL DEFAULT 'automatic'
CHECK (
  acquisition_mode IN (
    'automatic',
    'manual',
    'advanced'
  )
), requirement_config_json TEXT
NOT NULL DEFAULT '{}', created_by_user_id INTEGER
REFERENCES users(id)
ON DELETE SET NULL);
CREATE TABLE user_profile_badges (
  user_id INTEGER NOT NULL,

  badge_key TEXT NOT NULL,

  source TEXT NOT NULL
    DEFAULT 'automatic'
    CHECK (
      source IN (
        'automatic',
        'manual'
      )
    ),

  awarded_by_user_id INTEGER,

  awarded_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  metadata_json TEXT NOT NULL
    DEFAULT '{}',

  revoked_at TEXT,

  PRIMARY KEY (
    user_id,
    badge_key
  ),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (badge_key)
    REFERENCES profile_badges(badge_key)
    ON DELETE CASCADE,

  FOREIGN KEY (awarded_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);
CREATE TABLE user_badge_showcase (
  user_id INTEGER NOT NULL,

  badge_key TEXT NOT NULL,

  display_order INTEGER NOT NULL
    DEFAULT 100,

  added_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (
    user_id,
    badge_key
  ),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (badge_key)
    REFERENCES profile_badges(badge_key)
    ON DELETE CASCADE
);
CREATE TABLE user_site_interaction_stats (
  user_id INTEGER NOT NULL,

  interaction_key TEXT NOT NULL,

  /*
   * Chaîne vide pour une interaction globale.
   * Exemple : jevent-2026 pour cette édition.
   */
  event_key TEXT NOT NULL
    DEFAULT '',

  /*
   * 0 signifie qu’aucune journée précise
   * n’est associée à l’interaction.
   */
  event_day INTEGER NOT NULL
    DEFAULT 0,

  interaction_count INTEGER NOT NULL
    DEFAULT 0
    CHECK (interaction_count >= 0),

  first_interaction_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  last_interaction_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (
    user_id,
    interaction_key,
    event_key,
    event_day
  ),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CHECK (
    event_day BETWEEN 0 AND 3
  )
);
CREATE TABLE interaction_settings (
  id INTEGER PRIMARY KEY
    CHECK (id = 1),

  enabled INTEGER NOT NULL
    DEFAULT 1
    CHECK (enabled IN (0, 1)),

  image_cost_cents INTEGER NOT NULL
    DEFAULT 500
    CHECK (image_cost_cents > 0),

  maximum_file_size_bytes INTEGER NOT NULL
    DEFAULT 2097152
    CHECK (maximum_file_size_bytes > 0),

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE interaction_wallets (
  user_id INTEGER PRIMARY KEY,

  personal_code TEXT NOT NULL
    COLLATE NOCASE
    UNIQUE,

  /*
   * Exemple :
   * 250 = 2,50 crédits.
   */
  balance_cents INTEGER NOT NULL
    DEFAULT 0
    CHECK (balance_cents >= 0),

  total_earned_cents INTEGER NOT NULL
    DEFAULT 0
    CHECK (total_earned_cents >= 0),

  total_spent_cents INTEGER NOT NULL
    DEFAULT 0
    CHECK (total_spent_cents >= 0),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);
CREATE TABLE interaction_donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  provider TEXT NOT NULL
    DEFAULT 'streamlabs_charity',

  provider_donation_id TEXT NOT NULL,

  /*
   * NULL si aucun code valide n’a été trouvé.
   */
  user_id INTEGER,

  creator_id INTEGER,

  recognized_code TEXT
    COLLATE NOCASE,

  donor_name TEXT,

  donation_message TEXT,

  /*
   * Montant réellement donné, en centimes.
   */
  amount_cents INTEGER NOT NULL
    DEFAULT 0
    CHECK (amount_cents >= 0),

  /*
   * Montant ajouté au portefeuille.
   * Pour une cagnotte en euros :
   * 100 centimes donnés = 100 centimes de crédit.
   */
  credited_cents INTEGER NOT NULL
    DEFAULT 0
    CHECK (credited_cents >= 0),

  currency TEXT NOT NULL
    DEFAULT 'EUR',

  status TEXT NOT NULL
    DEFAULT 'credited'
    CHECK (
      status IN (
        'credited',
        'ignored',
        'reversed'
      )
    ),

  donated_at TEXT,

  raw_payload_json TEXT NOT NULL
    DEFAULT '{}',

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP, revealed_at TEXT,

  UNIQUE (
    provider,
    provider_donation_id
  ),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE SET NULL
);
CREATE TABLE interaction_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  user_id INTEGER NOT NULL,

  storage_key TEXT NOT NULL UNIQUE,

  original_name TEXT NOT NULL,

  content_type TEXT NOT NULL
    CHECK (
      content_type IN (
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ),

  file_size_bytes INTEGER NOT NULL
    CHECK (
      file_size_bytes BETWEEN 1 AND 2097152
    ),

  sha256 TEXT,

  width INTEGER,
  height INTEGER,

  status TEXT NOT NULL
    DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected',
        'cancelled'
      )
    ),

  /*
   * 500 = 5 crédits.
   */
  credit_cost_cents INTEGER NOT NULL
    DEFAULT 500
    CHECK (credit_cost_cents > 0),

  credit_refunded INTEGER NOT NULL
    DEFAULT 0
    CHECK (credit_refunded IN (0, 1)),

  moderation_note TEXT,

  reviewed_by_user_id INTEGER,

  reviewed_at TEXT,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP, interaction_id INTEGER
REFERENCES "creator_interactions_old"(id)
ON DELETE SET NULL, delivery_status TEXT NOT NULL
DEFAULT 'waiting'
CHECK (
  delivery_status IN (
    'waiting',
    'used',
    'dismissed'
  )
), delivered_at TEXT, handled_by_user_id INTEGER
REFERENCES users(id)
ON DELETE SET NULL,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (reviewed_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);
CREATE TABLE interaction_credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  user_id INTEGER NOT NULL,

  entry_type TEXT NOT NULL
    CHECK (
      entry_type IN (
        'donation',
        'donation_reversal',
        'image_submission',
        'image_refund',
        'manual_adjustment'
      )
    ),

  /*
   * Positif : ajout de crédits.
   * Négatif : dépense de crédits.
   */
  amount_cents INTEGER NOT NULL
    CHECK (amount_cents != 0),

  balance_after_cents INTEGER NOT NULL
    CHECK (balance_after_cents >= 0),

  donation_id INTEGER,

  upload_id INTEGER,

  reference_key TEXT,

  note TEXT,

  created_by_user_id INTEGER,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (donation_id)
    REFERENCES interaction_donations(id)
    ON DELETE SET NULL,

  FOREIGN KEY (upload_id)
    REFERENCES interaction_uploads(id)
    ON DELETE SET NULL,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);
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
    DEFAULT CURRENT_TIMESTAMP, draw_mode TEXT NOT NULL DEFAULT 'manual' CHECK (draw_mode IN ('manual', 'automatic')),

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
    DEFAULT CURRENT_TIMESTAMP, layout_json TEXT NOT NULL
DEFAULT '{}',

  FOREIGN KEY (rule_id)
    REFERENCES creator_donation_alert_rules(id)
    ON DELETE CASCADE
);
CREATE TABLE donation_alert_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL,

  enabled INTEGER NOT NULL DEFAULT 1
    CHECK (enabled IN (0, 1)),

  is_default INTEGER NOT NULL DEFAULT 0
    CHECK (is_default IN (0, 1)),

  image_storage_key TEXT,

  video_storage_key TEXT,

  sound_storage_key TEXT,

  media_type TEXT NOT NULL DEFAULT 'none'
    CHECK (
      media_type IN (
        'none',
        'image',
        'video'
      )
    ),

  layout_json TEXT NOT NULL DEFAULT '{}',

  created_by_user_id INTEGER,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);
CREATE TABLE overlay_donation_cursors (
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
CREATE TABLE overlay_donation_deliveries (
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
    DEFAULT CURRENT_TIMESTAMP, revealed_at TEXT,

  FOREIGN KEY (overlay_id)
    REFERENCES creator_overlays(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "creator_overlays" (
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
CREATE TABLE interaction_effect_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  interaction_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  user_id INTEGER,

  effect_key TEXT NOT NULL,

  cost_cents INTEGER NOT NULL DEFAULT 0
    CHECK (cost_cents >= 0),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'processing',
        'completed',
        'cancelled'
      )
    ),

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  processing_at TEXT,

  completed_at TEXT, claim_token TEXT,

  FOREIGN KEY (interaction_id)
    REFERENCES creator_interactions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
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
CREATE UNIQUE INDEX idx_goals_public_id
ON goals(public_id);
CREATE INDEX idx_program_entries_goal_id
ON program_entries(goal_id);
CREATE INDEX idx_viewer_stats_twitch_id
ON viewer_chat_daily_stats (
  viewer_twitch_id
);
CREATE INDEX idx_viewer_stats_event
ON viewer_chat_daily_stats (
  event_key,
  viewer_twitch_id
);
CREATE INDEX idx_viewer_stats_creator
ON viewer_chat_daily_stats (
  creator_id,
  stat_date
);
CREATE INDEX idx_viewer_stats_event_day
ON viewer_chat_daily_stats (
  event_key,
  event_day
);
CREATE INDEX idx_user_profile_badges_active
ON user_profile_badges (
  user_id,
  revoked_at
);
CREATE INDEX idx_site_interactions_user
ON user_site_interaction_stats (
  user_id
);
CREATE INDEX idx_site_interactions_key
ON user_site_interaction_stats (
  interaction_key,
  event_key,
  event_day
);
CREATE INDEX idx_interaction_wallet_code
ON interaction_wallets (
  personal_code
);
CREATE INDEX idx_interaction_donations_user
ON interaction_donations (
  user_id,
  donated_at
);
CREATE INDEX idx_interaction_donations_creator
ON interaction_donations (
  creator_id,
  donated_at
);
CREATE INDEX idx_interaction_uploads_user
ON interaction_uploads (
  user_id,
  created_at
);
CREATE INDEX idx_interaction_uploads_status
ON interaction_uploads (
  status,
  created_at
);
CREATE UNIQUE INDEX idx_interaction_ledger_reference
ON interaction_credit_ledger (
  entry_type,
  reference_key
)
WHERE reference_key IS NOT NULL;
CREATE INDEX idx_interaction_ledger_user
ON interaction_credit_ledger (
  user_id,
  created_at
);
CREATE INDEX idx_interaction_uploads_interaction
ON interaction_uploads (
  interaction_id,
  status,
  created_at
);
CREATE UNIQUE INDEX interaction_donations_provider_unique
ON interaction_donations (
  provider,
  provider_donation_id
);
CREATE INDEX interaction_uploads_delivery_index
ON interaction_uploads (
  status,
  delivery_status,
  interaction_id,
  created_at
);
CREATE UNIQUE INDEX creator_raffles_one_running
ON creator_raffles (
  creator_id
)
WHERE status IN (
  'countdown',
  'active',
  'drawing'
);
CREATE INDEX creator_raffles_creator_status
ON creator_raffles (
  creator_id,
  status,
  created_at
);
CREATE INDEX raffle_entries_raffle
ON raffle_entries (
  raffle_id,
  created_at
);
CREATE INDEX raffle_entries_participant
ON raffle_entries (
  raffle_id,
  participant_key
);
CREATE INDEX creator_donation_alert_rules_creator
ON creator_donation_alert_rules (
  creator_id,
  enabled,
  priority
);
CREATE INDEX creator_donation_alert_variants_rule
ON creator_donation_alert_variants (
  rule_id,
  enabled,
  display_order
);
CREATE UNIQUE INDEX donation_alert_templates_default
ON donation_alert_templates (
  is_default
)
WHERE is_default = 1;
CREATE INDEX overlay_donation_deliveries_queue
ON overlay_donation_deliveries (
  overlay_id,
  status,
  id
);
CREATE INDEX overlay_donation_tests_queue
ON overlay_donation_tests (
  overlay_id,
  status,
  created_at
);
CREATE INDEX idx_interaction_donations_creator_history
ON interaction_donations (creator_id, id DESC);
CREATE INDEX idx_overlay_donation_tests_history
ON overlay_donation_tests (overlay_id, id DESC);
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
CREATE INDEX idx_creator_interactions_creator
ON creator_interactions (
  creator_id,
  visible,
  enabled,
  display_order
);
CREATE INDEX idx_creator_interactions_type
ON creator_interactions (
  interaction_type,
  visible,
  enabled
);
CREATE INDEX idx_effect_deliveries_creator_status
ON interaction_effect_deliveries (
  creator_id,
  status,
  created_at,
  id
);
CREATE INDEX idx_effect_deliveries_public_id
ON interaction_effect_deliveries (
  public_id
);
CREATE TRIGGER interaction_uploads_charge_wallet
BEFORE INSERT ON interaction_uploads
FOR EACH ROW
WHEN NEW.credit_cost_cents > 0
BEGIN
  SELECT RAISE(
    ABORT,
    'INSUFFICIENT_CREDITS'
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM interaction_wallets
    WHERE user_id = NEW.user_id
      AND balance_cents >=
        NEW.credit_cost_cents
  );

  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents -
      NEW.credit_cost_cents,

    total_spent_cents =
      total_spent_cents +
      NEW.credit_cost_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER interaction_uploads_create_ledger
AFTER INSERT ON interaction_uploads
FOR EACH ROW
WHEN NEW.credit_cost_cents > 0
BEGIN
  INSERT INTO interaction_credit_ledger (
    user_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    upload_id,
    reference_key,
    note,
    created_by_user_id,
    created_at
  )
  SELECT
    NEW.user_id,
    'image_submission',
    -NEW.credit_cost_cents,
    wallets.balance_cents,
    NEW.id,
    NEW.public_id,
    'Envoi d’une image',
    NEW.user_id,
    CURRENT_TIMESTAMP
  FROM interaction_wallets AS wallets
  WHERE wallets.user_id =
    NEW.user_id;
END;
CREATE TRIGGER interaction_donations_credit_wallet
AFTER INSERT ON interaction_donations
FOR EACH ROW
WHEN
  NEW.status = 'credited'
  AND NEW.user_id IS NOT NULL
  AND NEW.credited_cents > 0
BEGIN
  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents +
      NEW.credited_cents,

    total_earned_cents =
      total_earned_cents +
      NEW.credited_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id =
    NEW.user_id;

  INSERT INTO interaction_credit_ledger (
    user_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    donation_id,
    reference_key,
    note,
    created_at
  )
  SELECT
    NEW.user_id,
    'donation',
    NEW.credited_cents,
    wallets.balance_cents,
    NEW.id,
    NEW.provider_donation_id,
    'Crédits obtenus grâce à un don',
    CURRENT_TIMESTAMP

  FROM interaction_wallets
    AS wallets

  WHERE wallets.user_id =
    NEW.user_id;
END;
CREATE TRIGGER interaction_effect_deliveries_charge_wallet
BEFORE INSERT ON interaction_effect_deliveries
WHEN NEW.cost_cents > 0
  AND NEW.user_id IS NOT NULL
BEGIN
  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents - NEW.cost_cents,

    total_spent_cents =
      total_spent_cents + NEW.cost_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id = NEW.user_id
    AND balance_cents >= NEW.cost_cents;

  SELECT CASE
    WHEN changes() = 0
    THEN RAISE(
      ABORT,
      'INSUFFICIENT_CREDITS'
    )
  END;
END;
