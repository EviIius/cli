# Security model

- Provider credentials are server-only environment secrets; `.env` is ignored and the UI never accepts keys.
- Passwords use salted scrypt hashes. Session tokens are HMAC-signed, expire after eight hours, and include tenant and role claims.
- Every tenant route checks the authenticated tenant. Owner/admin/builder/viewer roles restrict mutation and sensitive control-plane reads.
- Provider/model allowlists, private-lane isolation, monthly budgets, and per-tenant rate limits are enforced before inference.
- Tool input is JSON-schema validated. Write tools suspend in a persisted approval state and fail closed until an owner/admin decides.
- Credential-shaped fields and bearer/key patterns are redacted before message and error persistence.
- Retention purge removes old messages, completed approvals, usage, audit events, traces, and artifacts while preserving active dependencies.
- Container and Kubernetes manifests run the API as non-root and Kubernetes drops Linux capabilities and uses a read-only root filesystem.

## Production checklist

1. Store `AUTH_SECRET`, `DATABASE_URL`, provider keys, and `HF_TOKEN` in a cloud secret manager; never use the Kubernetes example secret verbatim.
2. Terminate TLS at a trusted ingress and restrict CORS to the deployed console origin.
3. Use managed PostgreSQL with TLS, backups, point-in-time recovery, least-privilege credentials, and migration gating.
4. Put tool execution in an egress-restricted worker boundary before adding tenant-supplied tools.
5. Encrypt artifact storage, configure tenant-specific retention, and export audit records to an append-only security sink.
6. Rotate provider keys, authentication secrets, and database credentials on a schedule and after any exposure.
7. Alert on authentication failures, budget rejects, provider error rate, approval age, job failures, and telemetry loss.

The included authentication is suitable for a self-managed deployment. Enterprise SSO/OIDC, SCIM, KMS-backed envelope encryption, and a distributed queue are natural extensions for large installations.
