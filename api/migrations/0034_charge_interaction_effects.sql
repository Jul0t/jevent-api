CREATE TRIGGER IF NOT EXISTS
  interaction_effect_deliveries_charge_wallet
BEFORE INSERT ON interaction_effect_deliveries
WHEN NEW.cost_cents > 0
  AND NEW.user_id IS NOT NULL
BEGIN
  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents - NEW.cost_cents,

    total_spent_cents =
      total_spent_cents + NEW.cost_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id = NEW.user_id
    AND balance_cents >= NEW.cost_cents;

  SELECT CASE
    WHEN changes() = 0
    THEN RAISE(
      ABORT,
      'INSUFFICIENT_CREDITS'
    )
  END;
END;