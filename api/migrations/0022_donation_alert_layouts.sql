ALTER TABLE creator_donation_alert_variants
ADD COLUMN layout_json TEXT NOT NULL
DEFAULT '{}';