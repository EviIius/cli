CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  sequence integer NOT NULL,
  content jsonb NOT NULL,
  name text,
  tool_call_id text,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_session_sequence_idx ON messages(session_id, sequence);
CREATE TABLE IF NOT EXISTS traces (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  session_id uuid NOT NULL REFERENCES sessions(id),
  status text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  session_id uuid NOT NULL REFERENCES sessions(id),
  trace_id uuid NOT NULL REFERENCES traces(id),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(14,8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','builder','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  trace_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  session_id uuid NOT NULL REFERENCES sessions(id),
  trace_id uuid NOT NULL REFERENCES traces(id),
  tool_call_id text,
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  reason text
);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid,
  type text NOT NULL CHECK(type IN ('single','planner-reviewer')), status text NOT NULL,
  input jsonb NOT NULL, state jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text, lease_expires_at timestamptz
);
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), job_id uuid REFERENCES jobs(id),
  session_id uuid REFERENCES sessions(id), name text NOT NULL, media_type text NOT NULL,
  content jsonb NOT NULL, size_bytes integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_session_created_idx ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS traces_tenant_started_idx ON traces(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS traces_data_gin_idx ON traces USING gin(data);
CREATE INDEX IF NOT EXISTS usage_tenant_created_idx ON usage_records(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_tenant_created_idx ON audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS approvals_tenant_status_idx ON approvals(tenant_id,status,requested_at DESC);
CREATE INDEX IF NOT EXISTS jobs_tenant_status_idx ON jobs(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS artifacts_tenant_job_idx ON artifacts(tenant_id,job_id,created_at DESC);
