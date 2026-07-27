CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid,
  type text NOT NULL CHECK(type IN ('single','planner-reviewer')), status text NOT NULL,
  input jsonb NOT NULL, state jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), job_id uuid REFERENCES jobs(id),
  session_id uuid REFERENCES sessions(id), name text NOT NULL, media_type text NOT NULL,
  content jsonb NOT NULL, size_bytes integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_tenant_status_idx ON jobs(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS artifacts_tenant_job_idx ON artifacts(tenant_id,job_id,created_at DESC);
