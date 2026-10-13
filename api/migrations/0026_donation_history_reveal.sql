ALTER TABLE creators
ADD COLUMN hide_donation_details_until_overlay INTEGER NOT NULL DEFAULT 1;

ALTER TABLE interaction_donations
ADD COLUMN revealed_at TEXT;

-- Les anciens dons restent immédiatement visibles.
UPDATE interaction_donations
SET revealed_at = CURRENT_TIMESTAMP
WHERE revealed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interaction_donations_creator_history
ON interaction_donations (creator_id, id DESC);