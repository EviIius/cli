CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
  description text NOT NULL DEFAULT '', created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz, idempotency_key text,
  UNIQUE(tenant_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS workflow_drafts (
  workflow_id uuid PRIMARY KEY REFERENCES workflows(id), tenant_id uuid NOT NULL REFERENCES tenants(id),
  revision bigint NOT NULL DEFAULT 1, definition jsonb NOT NULL, content_hash text NOT NULL,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), workflow_id uuid NOT NULL REFERENCES workflows(id),
  version_number integer NOT NULL, definition jsonb NOT NULL, content_hash text NOT NULL,
  compiled_plan jsonb NOT NULL, release_notes text NOT NULL DEFAULT '', published_by uuid,
  idempotency_key text NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,workflow_id,version_number), UNIQUE(tenant_id,workflow_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS workflows_tenant_updated_idx ON workflows(tenant_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS workflow_versions_workflow_idx ON workflow_versions(tenant_id,workflow_id,version_number DESC);
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workflows;
CREATE POLICY tenant_isolation ON workflows USING (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON workflow_drafts;
CREATE POLICY tenant_isolation ON workflow_drafts USING (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON workflow_versions;
CREATE POLICY tenant_isolation ON workflow_versions USING (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('relay.tenant_id',true),'')::uuid);
