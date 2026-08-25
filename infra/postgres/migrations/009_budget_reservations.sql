CREATE TABLE IF NOT EXISTS budget_reservations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  idempotency_key text NOT NULL,
  reserved_usd numeric(14,8) NOT NULL CHECK (reserved_usd >= 0),
  actual_usd numeric(14,8),
  status text NOT NULL CHECK (status IN ('reserved','settled','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS budget_reservations_active_idx ON budget_reservations(tenant_id,created_at) WHERE status='reserved';
ALTER TABLE budget_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON budget_reservations;
CREATE POLICY tenant_isolation ON budget_reservations USING (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('relay.tenant_id', true), '')::uuid);
