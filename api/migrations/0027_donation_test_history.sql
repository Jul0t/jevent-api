ALTER TABLE overlay_donation_tests
ADD COLUMN revealed_at TEXT;

-- Les anciens tests terminés restent visibles.
UPDATE overlay_donation_tests
SET revealed_at = CURRENT_TIMESTAMP
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_overlay_donation_tests_history
ON overlay_donation_tests (overlay_id, id DESC);
