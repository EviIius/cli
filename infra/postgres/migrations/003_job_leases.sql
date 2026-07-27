ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS jobs_recovery_idx ON jobs(status,lease_expires_at) WHERE status IN ('queued','running');
