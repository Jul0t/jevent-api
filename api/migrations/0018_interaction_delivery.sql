ALTER TABLE interaction_uploads
ADD COLUMN delivery_status TEXT NOT NULL
DEFAULT 'waiting'
CHECK (
  delivery_status IN (
    'waiting',
    'used',
    'dismissed'
  )
);

ALTER TABLE interaction_uploads
ADD COLUMN delivered_at TEXT;

ALTER TABLE interaction_uploads
ADD COLUMN handled_by_user_id INTEGER
REFERENCES users(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS
  interaction_uploads_delivery_index
ON interaction_uploads (
  status,
  delivery_status,
  interaction_id,
  created_at
);