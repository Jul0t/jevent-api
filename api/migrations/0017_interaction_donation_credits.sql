CREATE UNIQUE INDEX IF NOT EXISTS
  interaction_donations_provider_unique
ON interaction_donations (
  provider,
  provider_donation_id
);

DROP TRIGGER IF EXISTS
  interaction_donations_credit_wallet;

CREATE TRIGGER
  interaction_donations_credit_wallet
AFTER INSERT ON interaction_donations
FOR EACH ROW
WHEN
  NEW.status = 'credited'
  AND NEW.user_id IS NOT NULL
  AND NEW.credited_cents > 0
BEGIN
  UPDATE interaction_wallets
  SET
    balance_cents =
      balance_cents +
      NEW.credited_cents,

    total_earned_cents =
      total_earned_cents +
      NEW.credited_cents,

    updated_at =
      CURRENT_TIMESTAMP

  WHERE user_id =
    NEW.user_id;

  INSERT INTO interaction_credit_ledger (
    user_id,
    entry_type,
    amount_cents,
    balance_after_cents,
    donation_id,
    reference_key,
    note,
    created_at
  )
  SELECT
    NEW.user_id,
    'donation',
    NEW.credited_cents,
    wallets.balance_cents,
    NEW.id,
    NEW.provider_donation_id,
    'Crédits obtenus grâce à un don',
    CURRENT_TIMESTAMP

  FROM interaction_wallets
    AS wallets

  WHERE wallets.user_id =
    NEW.user_id;
END;
