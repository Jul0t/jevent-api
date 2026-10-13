ALTER TABLE goals
ADD COLUMN public_id TEXT;

UPDATE goals
SET public_id =
  'goal_' || lower(hex(randomblob(16)))
WHERE public_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
idx_goals_public_id
ON goals(public_id);

ALTER TABLE program_entries
ADD COLUMN goal_id INTEGER
REFERENCES goals(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS
idx_program_entries_goal_id
ON program_entries(goal_id);