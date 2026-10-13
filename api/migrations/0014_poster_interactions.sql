-- =========================================================
-- Configuration de l’interaction
-- 100 centimes de crédit = 1 crédit
-- Une image coûte 500 centimes = 5 crédits
-- =========================================================

CREATE TABLE IF NOT EXISTS interaction_settings (
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

INSERT INTO interaction_settings (
  id,
  enabled,
  image_cost_cents,
  maximum_file_size_bytes
)
VALUES (
  1,
  1,
  500,
  2097152
)
ON CONFLICT(id)
DO NOTHING;

-- =========================================================
-- Portefeuille et code personnel
-- =========================================================

CREATE TABLE IF NOT EXISTS interaction_wallets (
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

CREATE INDEX IF NOT EXISTS
  idx_interaction_wallet_code
ON interaction_wallets (
  personal_code
);

-- =========================================================
-- Dons reçus depuis Streamlabs Charity
-- =========================================================

CREATE TABLE IF NOT EXISTS interaction_donations (
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
    DEFAULT CURRENT_TIMESTAMP,

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

CREATE INDEX IF NOT EXISTS
  idx_interaction_donations_user
ON interaction_donations (
  user_id,
  donated_at
);

CREATE INDEX IF NOT EXISTS
  idx_interaction_donations_creator
ON interaction_donations (
  creator_id,
  donated_at
);

-- =========================================================
-- Images envoyées
-- =========================================================

CREATE TABLE IF NOT EXISTS interaction_uploads (
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
    DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (reviewed_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS
  idx_interaction_uploads_user
ON interaction_uploads (
  user_id,
  created_at
);

CREATE INDEX IF NOT EXISTS
  idx_interaction_uploads_status
ON interaction_uploads (
  status,
  created_at
);

-- =========================================================
-- Historique des mouvements de crédits
-- =========================================================

CREATE TABLE IF NOT EXISTS interaction_credit_ledger (
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

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_interaction_ledger_reference
ON interaction_credit_ledger (
  entry_type,
  reference_key
)
WHERE reference_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_interaction_ledger_user
ON interaction_credit_ledger (
  user_id,
  created_at
);