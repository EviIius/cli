CREATE UNIQUE INDEX IF NOT EXISTS sessions_id_tenant_idx ON sessions(id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS traces_id_tenant_idx ON traces(id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_id_tenant_idx ON jobs(id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS approvals_id_tenant_idx ON approvals(id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_id_tenant_idx ON artifacts(id, tenant_id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE messages m SET tenant_id=s.tenant_id FROM sessions s WHERE m.session_id=s.id AND m.tenant_id IS NULL;
ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS messages_tenant_session_idx ON messages(tenant_id,session_id,sequence);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON sessions;
CREATE POLICY tenant_isolation ON sessions USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON traces;
CREATE POLICY tenant_isolation ON traces USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON usage_records;
CREATE POLICY tenant_isolation ON usage_records USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
CREATE POLICY tenant_isolation ON audit_events USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON approvals;
CREATE POLICY tenant_isolation ON approvals USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON jobs;
CREATE POLICY tenant_isolation ON jobs USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON artifacts;
CREATE POLICY tenant_isolation ON artifacts USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON messages;
CREATE POLICY tenant_isolation ON messages USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);

-- Production deployments should use a non-owner application role. Table owners and
-- migration roles intentionally retain RLS bypass so migrations and recovery work.
