# Threat model

## Assets and trust boundaries

Tenant messages, workflow definitions, provider credentials, approval decisions, artifacts, audit events, and usage/budget state are protected assets. Browser input, model output, attachments, external HTTP content, tool output, and connection metadata are untrusted. The primary boundaries are browser → API, API → PostgreSQL, orchestrator → provider, and worker → tool/connector.

## Principal threats and controls

- Cross-tenant identifiers: tenant predicates exist in repository methods and PostgreSQL RLS policies; production must use a non-owner application role and run negative isolation tests.
- Credential theft and browser injection: keys remain server-side; production uses `HttpOnly` cookies, explicit CORS, strict startup configuration, and redaction. Add CSP at the edge and enterprise OIDC before external collaboration.
- Duplicate side effects: run, publication, and tool-operation idempotency keys plus exact-once approval claims limit retries. External connectors must propagate idempotency keys.
- Prompt injection and hostile artifacts: attachment content is labeled untrusted, size/MIME constrained, and never authorizes tools. Large/binary uploads require the quarantine/object-store boundary.
- Tool escape and SSRF: bundled tools have schema, time, approval, and output limits. Do not add tenant code or broad HTTP tools until isolated workers and default-deny egress exist.
- Budget races: reservations are transactionally locked before inference and settled after completion. Alert on abandoned reservations and reconcile them after crashes.
- Supply-chain compromise: source archives contain tracked files only, tracked-file secret scanning runs in CI, lockfile installs are mandatory, and container/IaC/SBOM gates must remain enabled.

Residual risks and external system requirements are tracked in `production-readiness.md` rather than hidden behind product claims.
