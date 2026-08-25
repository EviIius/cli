ALTER TABLE approvals ADD COLUMN IF NOT EXISTS operation_key text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_status text NOT NULL DEFAULT 'not_started';
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS resumed_at timestamptz;

UPDATE approvals SET operation_key = trace_id::text || ':' || COALESCE(tool_call_id, id::text) WHERE operation_key IS NULL;
ALTER TABLE approvals ALTER COLUMN operation_key SET NOT NULL;
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_execution_status_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_execution_status_check CHECK (execution_status IN ('not_started','executing','succeeded','failed'));
CREATE UNIQUE INDEX IF NOT EXISTS approvals_tenant_operation_idx ON approvals(tenant_id, operation_key);
