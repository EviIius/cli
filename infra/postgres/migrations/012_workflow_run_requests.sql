CREATE TABLE IF NOT EXISTS workflow_run_requests (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id),
  idempotency_key text NOT NULL,
  job_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,workflow_version_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS workflow_run_requests_job_idx ON workflow_run_requests(tenant_id,job_id);
ALTER TABLE workflow_run_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workflow_run_requests;
CREATE POLICY tenant_isolation ON workflow_run_requests
  USING (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid);
