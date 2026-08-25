# Relay coding instructions

Preserve the TypeScript monorepo boundaries. Put shared schemas in `packages/contracts`, persistence behind `RelayStore`, HTTP behavior in `services/api`, execution behavior in workers, and feature UI outside the root `App.tsx` when adding substantial functionality.

Security-sensitive resources must be tenant-scoped at the persistence layer. Production configuration fails closed. Never expose credentials to browser code, logs, fixtures, archives, or events. Use stable error codes, strict schemas, idempotency keys for side effects, ETags for mutable drafts, and immutable published workflow versions.

Before declaring a change complete, run the secret scan, typecheck, tests, and build. Include negative authorization tests, migration notes, accessibility review, and residual risks where applicable.
