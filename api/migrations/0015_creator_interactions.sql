-- =========================================================
-- Catalogue des interactions par créateur
-- =========================================================

CREATE TABLE IF NOT EXISTS creator_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  public_id TEXT NOT NULL UNIQUE,

  creator_id INTEGER NOT NULL,

  slug TEXT NOT NULL,

  title TEXT NOT NULL,

  description TEXT NOT NULL
    DEFAULT '',

  interaction_type TEXT NOT NULL
    DEFAULT 'image'
    CHECK (
      interaction_type IN (
        'image',
        'text',
        'code',
        'sound',
        'advanced'
      )
    ),

  /*
   * 500 centimes de crédit = 5 crédits.
   */
  cost_cents INTEGER NOT NULL
    DEFAULT 500
    CHECK (cost_cents >= 0),

  moderation_required INTEGER NOT NULL
    DEFAULT 1
    CHECK (
      moderation_required IN (0, 1)
    ),

  visible INTEGER NOT NULL
    DEFAULT 1
    CHECK (
      visible IN (0, 1)
    ),

  enabled INTEGER NOT NULL
    DEFAULT 1
    CHECK (
      enabled IN (0, 1)
    ),

  /*
   * Configuration propre au type d’interaction.
   * Exemple pour une image :
   * {
   *   "maximumFileSizeBytes": 2097152,
   *   "allowedContentTypes": [
   *     "image/jpeg",
   *     "image/png",
   *     "image/webp"
   *   ]
   * }
   */
  config_json TEXT NOT NULL
    DEFAULT '{}',

  display_order INTEGER NOT NULL
    DEFAULT 100,

  opens_at TEXT,

  closes_at TEXT,

  created_by_user_id INTEGER,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    creator_id,
    slug
  ),

  FOREIGN KEY (creator_id)
    REFERENCES creators(id)
    ON DELETE CASCADE,

  FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS
  idx_creator_interactions_creator
ON creator_interactions (
  creator_id,
  visible,
  enabled,
  display_order
);

CREATE INDEX IF NOT EXISTS
  idx_creator_interactions_type
ON creator_interactions (
  interaction_type,
  visible,
  enabled
);

-- =========================================================
-- Lien entre une image et l’interaction choisie
-- =========================================================

ALTER TABLE interaction_uploads
ADD COLUMN interaction_id INTEGER
REFERENCES creator_interactions(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS
  idx_interaction_uploads_interaction
ON interaction_uploads (
  interaction_id,
  status,
  created_at
);

-- =========================================================
-- Interaction image par défaut pour les créateurs existants
-- =========================================================

INSERT OR IGNORE INTO creator_interactions (
  public_id,
  creator_id,
  slug,
  title,
  description,
  interaction_type,
  cost_cents,
  moderation_required,
  visible,
  enabled,
  config_json,
  display_order
)
SELECT
  'interaction_' ||
    LOWER(
      HEX(
        RANDOMBLOB(12)
      )
    ),

  creators.id,

  'image',

  'Afficher une image',

  'Envoie une image qui pourra être affichée pendant le live après validation.',

  'image',

  500,

  1,
  1,
  1,

  '{
    "maximumFileSizeBytes": 2097152,
    "allowedContentTypes": [
      "image/jpeg",
      "image/png",
      "image/webp"
    ]
  }',

  100

FROM creators

WHERE creators.active = 1
  AND creators.archived = 0;