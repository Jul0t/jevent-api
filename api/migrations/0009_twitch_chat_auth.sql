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