ALTER TABLE program_entries
ADD COLUMN fallback_enabled INTEGER NOT NULL DEFAULT 0
CHECK (fallback_enabled IN (0, 1));

ALTER TABLE program_entries
ADD COLUMN fallback_title TEXT;

ALTER TABLE program_entries
ADD COLUMN fallback_description_markdown TEXT;

ALTER TABLE program_entries
ADD COLUMN fallback_category TEXT;

ALTER TABLE program_entries
ADD COLUMN fallback_external_url TEXT;