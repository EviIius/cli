# Production readiness and remaining external systems

This repository now implements the application-level containment and workflow foundation from the research report: strict production startup guards, cookie sessions, explicit CORS, tenant-scoped repositories and PostgreSQL RLS, atomic budget reservations, idempotent multi-tool approvals, bounded tool output, versioned graph drafts, optimistic concurrency, immutable publications, idempotent runs, CloudEvents-shaped run history, and a visual/outline workflow studio.

Some report recommendations are deliberately integration boundaries rather than fake local substitutes. They require organization-owned infrastructure and operational decisions before a general-availability claim:

- **Durable runtime:** the PostgreSQL job runtime checkpoints and recovers queued work, but it is not Temporal. Deploy managed Temporal, split API and worker processes, implement activity heartbeats/cancellation, and replay-test worker upgrades before calling execution crash-proof.
- **Enterprise identity:** local cookie authentication is suitable for a small self-managed installation. Configure an identity provider, OIDC callback/session rotation, MFA policy, SCIM lifecycle, and relationship authorization such as OpenFGA before external multi-tenant collaboration.
- **Database enforcement role:** every repository query is tenant-scoped and the migrations enable fail-closed PostgreSQL row-level-security policies. Before switching the application to a non-owner database role, propagate `relay.tenant_id` transaction-locally on every checked-out connection and run the included two-tenant negative suite with that exact role. The current owner-role deployment relies on the explicit tenant predicates because table owners bypass RLS by default.
- **Artifact service:** inline artifacts are capped at 750 KB and marked untrusted. Add S3-compatible encrypted storage, checksums, malware scanning, quarantine, retention, and signed retrieval for binary or large uploads.
- **Tool isolation:** validation, timeouts, exact-once approval claims, and output limits are enforced, but custom tools still need separate sandbox workers, per-tool identities, resource limits, and default-deny egress.
- **Event transport:** events use CloudEvents envelopes and an AsyncAPI contract. Add a transactional outbox and NATS/another broker only when independent consumers or replay requirements justify it.

## Release gates

Do not label a deployment generally available until two-tenant negative tests run against the production database role, backup restoration is rehearsed, the workflow can be completed keyboard-only, browser accessibility checks pass, provider contract tests run under controlled quotas, and the external systems above have owners, SLOs, alerts, and incident procedures.

Target initial service objectives: 99.9% API availability monthly, p95 control-plane reads below 500 ms, 99% queued runs starting within 30 seconds, RPO 15 minutes, and RTO 2 hours. These are targets—not measured guarantees—until dashboards and restore drills demonstrate them.
