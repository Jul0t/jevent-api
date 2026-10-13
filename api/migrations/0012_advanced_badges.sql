ALTER TABLE profile_badges
ADD COLUMN requirements_hidden INTEGER
NOT NULL DEFAULT 0
CHECK (requirements_hidden IN (0, 1));

ALTER TABLE profile_badges
ADD COLUMN acquisition_mode TEXT
NOT NULL DEFAULT 'automatic'
CHECK (
  acquisition_mode IN (
    'automatic',
    'manual',
    'advanced'
  )
);

ALTER TABLE profile_badges
ADD COLUMN requirement_config_json TEXT
NOT NULL DEFAULT '{}';

ALTER TABLE profile_badges
ADD COLUMN created_by_user_id INTEGER
REFERENCES users(id)
ON DELETE SET NULL;