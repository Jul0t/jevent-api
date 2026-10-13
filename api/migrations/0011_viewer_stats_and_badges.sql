-- =========================================================
-- Statistiques individuelles des viewers
-- =========================================================

CREATE TABLE IF NOT EXISTS viewer_chat_daily_stats (
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

CREATE INDEX IF NOT EXISTS
  idx_viewer_stats_twitch_id
ON viewer_chat_daily_stats (
  viewer_twitch_id
);

CREATE INDEX IF NOT EXISTS
  idx_viewer_stats_event
ON viewer_chat_daily_stats (
  event_key,
  viewer_twitch_id
);

CREATE INDEX IF NOT EXISTS
  idx_viewer_stats_creator
ON viewer_chat_daily_stats (
  creator_id,
  stat_date
);

CREATE INDEX IF NOT EXISTS
  idx_viewer_stats_event_day
ON viewer_chat_daily_stats (
  event_key,
  event_day
);

-- =========================================================
-- Catalogue des badges
-- =========================================================

CREATE TABLE IF NOT EXISTS profile_badges (
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
);

-- =========================================================
-- Badges débloqués par les comptes
-- =========================================================

CREATE TABLE IF NOT EXISTS user_profile_badges (
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

CREATE INDEX IF NOT EXISTS
  idx_user_profile_badges_active
ON user_profile_badges (
  user_id,
  revoked_at
);

-- =========================================================
-- Badges choisis pour la future carte partageable
-- =========================================================

CREATE TABLE IF NOT EXISTS user_badge_showcase (
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

-- =========================================================
-- Badges automatiques du JEvent 26
-- =========================================================

INSERT INTO profile_badges (
  badge_key,
  label,
  description,
  icon_key,
  event_key,
  automatic,
  rule_key,
  threshold,
  display_order
)
VALUES
  (
    'jevent26-viewer-active',
    'Viewer actif',
    'A envoyé au moins 100 messages pendant le JEvent 26.',
    'messages',
    'jevent-2026',
    1,
    'message_count',
    100,
    10
  ),

  (
    'jevent26-chat-regular',
    'Habitué du chat',
    'A envoyé au moins 500 messages pendant le JEvent 26.',
    'chat',
    'jevent-2026',
    1,
    'message_count',
    500,
    20
  ),

  (
    'jevent26-three-days',
    'JEvent 26',
    'A participé à chacune des trois journées du JEvent 26.',
    'calendar',
    'jevent-2026',
    1,
    'event_days',
    3,
    30
  ),

  (
    'jevent26-explorer',
    'Explorateur',
    'A participé au chat de trois chaînes JEvent différentes.',
    'explorer',
    'jevent-2026',
    1,
    'channel_count',
    3,
    40
  ),

  (
    'jevent26-emote-fan',
    'Fan d’emotes',
    'A utilisé au moins 100 emotes pendant le JEvent 26.',
    'emote',
    'jevent-2026',
    1,
    'emote_count',
    100,
    50
  )

ON CONFLICT(badge_key)
DO UPDATE SET
  label = excluded.label,
  description = excluded.description,
  icon_key = excluded.icon_key,
  event_key = excluded.event_key,
  automatic = excluded.automatic,
  rule_key = excluded.rule_key,
  threshold = excluded.threshold,
  active = 1,
  display_order = excluded.display_order,
  updated_at = CURRENT_TIMESTAMP;