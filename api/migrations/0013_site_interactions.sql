CREATE TABLE IF NOT EXISTS user_site_interaction_stats (
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

CREATE INDEX IF NOT EXISTS
  idx_site_interactions_user
ON user_site_interaction_stats (
  user_id
);

CREATE INDEX IF NOT EXISTS
  idx_site_interactions_key
ON user_site_interaction_stats (
  interaction_key,
  event_key,
  event_day
);