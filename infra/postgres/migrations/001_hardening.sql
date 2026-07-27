ALTER TABLE messages ADD COLUMN IF NOT EXISTS sequence integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_call_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_calls jsonb;
UPDATE messages SET sequence = 0 WHERE sequence IS NULL;
ALTER TABLE messages ALTER COLUMN sequence SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS messages_session_sequence_idx ON messages(session_id, sequence);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, name text NOT NULL,
  password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','builder','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid,
  action text NOT NULL, resource_type text NOT NULL, resource_id text, trace_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), session_id uuid NOT NULL REFERENCES sessions(id),
  trace_id uuid NOT NULL REFERENCES traces(id), tool_call_id text, tool_name text NOT NULL, input jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')), requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by uuid, reason text
);
CREATE INDEX IF NOT EXISTS audit_tenant_created_idx ON audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS approvals_tenant_status_idx ON approvals(tenant_id,status,requested_at DESC);
