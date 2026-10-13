DROP TRIGGER IF EXISTS interaction_uploads_charge_wallet;

DROP TRIGGER IF EXISTS interaction_uploads_create_ledger;

CREATE TRIGGER interaction_uploads_charge_wallet
BEFORE INSERT ON interaction_uploads
FOR EACH ROW
WHEN NEW.credit_cost_cents > 0
BEGIN
  SELECT RAISE(
    ABORT,
    'INSUFFICIENT_CREDITS'
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM interaction_wallets
    WHERE user_id = NEW.user_id
      AND balance_cents >=
        NEW.credit_cost_cents
  );

  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents -
      NEW.credit_cost_cents,

    total_spent_cents =
      total_spent_cents +
      NEW.credit_cost_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER interaction_uploads_create_ledger
AFTER INSERT ON interaction_uploads
FOR EACH ROW
WHEN NEW.credit_cost_cents > 0
BEGIN
  INSERT INTO interaction_credit_ledger (
    user_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    upload_id,
    reference_key,
    note,
    created_by_user_id,
    created_at
  )
  SELECT
    NEW.user_id,
    'image_submission',
    -NEW.credit_cost_cents,
    wallets.balance_cents,
    NEW.id,
    NEW.public_id,
    'Envoi d’une image',
    NEW.user_id,
    CURRENT_TIMESTAMP
  FROM interaction_wallets AS wallets
  WHERE wallets.user_id =
    NEW.user_id;
END;
