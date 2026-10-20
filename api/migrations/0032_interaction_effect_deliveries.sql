CREATE TABLE IF NOT EXISTS interaction_effect_deliveries (
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

  completed_at TEXT,

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

CREATE INDEX IF NOT EXISTS
  idx_effect_deliveries_creator_status
ON interaction_effect_deliveries (
  creator_id,
  status,
  created_at,
  id
);

CREATE INDEX IF NOT EXISTS
  idx_effect_deliveries_public_id
ON interaction_effect_deliveries (
  public_id
);

DROP TRIGGER IF EXISTS interaction_effects_charge_wallet;

CREATE TRIGGER interaction_effects_charge_wallet
BEFORE INSERT ON interaction_effect_deliveries
FOR EACH ROW
WHEN NEW.cost_cents > 0
BEGIN
  SELECT RAISE(
    ABORT,
    'INSUFFICIENT_CREDITS'
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM interaction_wallets
    WHERE user_id = NEW.user_id
      AND balance_cents >= NEW.cost_cents
  );

  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents - NEW.cost_cents,

    total_spent_cents =
      total_spent_cents + NEW.cost_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id = NEW.user_id;
END;

DROP TRIGGER IF EXISTS interaction_effects_create_ledger;

CREATE TRIGGER interaction_effects_create_ledger
AFTER INSERT ON interaction_effect_deliveries
FOR EACH ROW
WHEN NEW.cost_cents > 0
BEGIN
  INSERT INTO interaction_credit_ledger (
    user_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    reference_key,
    note,
    created_by_user_id,
    created_at
  )
  SELECT
    NEW.user_id,
    'manual_adjustment',
    -NEW.cost_cents,
    wallets.balance_cents,
    NEW.public_id,
    'Déclenchement d’un effet visuel',
    NEW.user_id,
    CURRENT_TIMESTAMP
  FROM interaction_wallets AS wallets
  WHERE wallets.user_id =
    NEW.user_id;
END;