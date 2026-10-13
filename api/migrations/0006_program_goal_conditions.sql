ALTER TABLE program_entries
ADD COLUMN goal_condition TEXT NOT NULL DEFAULT 'always'
CHECK (
  goal_condition IN (
    'always',
    'reached',
    'not_reached'
  )
);

-- Les activités déjà associées à un goal
-- sont considérées comme conditionnées à son atteinte.
UPDATE program_entries
SET goal_condition = 'reached'
WHERE goal_id IS NOT NULL;