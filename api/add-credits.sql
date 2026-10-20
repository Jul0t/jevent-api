UPDATE interaction_wallets
SET
  balance_cents = balance_cents + 10000,
  updated_at = CURRENT_TIMESTAMP
WHERE user_id = 1;