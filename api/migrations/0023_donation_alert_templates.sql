PRAGMA foreign_keys = ON;

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

CREATE UNIQUE INDEX
  donation_alert_templates_default
ON donation_alert_templates (
  is_default
)
WHERE is_default = 1;

/*
 * On récupère la disposition et les médias de la
 * variante actuellement utilisée comme modèle.
 *
 * Les fichiers R2 ne sont pas dupliqués :
 * seule leur clé est enregistrée.
 */
INSERT INTO donation_alert_templates (
  public_id,
  name,
  enabled,
  is_default,
  image_storage_key,
  video_storage_key,
  sound_storage_key,
  media_type,
  layout_json,
  created_at,
  updated_at
)
SELECT
  'template_donation_alert_default',
  'Variante par défaut',
  1,
  1,
  image_storage_key,
  video_storage_key,
  sound_storage_key,
  media_type,
  layout_json,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM creator_donation_alert_variants
WHERE public_id =
  'variant_16e97bfa696a637b08e4c616'
LIMIT 1;