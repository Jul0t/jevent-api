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