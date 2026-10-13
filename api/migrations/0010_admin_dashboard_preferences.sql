CREATE TABLE IF NOT EXISTS admin_dashboard_preferences (
  user_id INTEGER PRIMARY KEY,

  layout_json TEXT NOT NULL
    DEFAULT '[]',

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);