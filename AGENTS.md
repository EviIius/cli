# Relay repository instructions

## Safety and tenancy

- Never print, copy, commit, or archive secret values. Treat `.env` as private local state.
- Every tenant-owned persistence read, write, update, and delete must include `tenantId` in its contract and SQL predicate.
- Production must fail closed when authentication, CORS, database persistence, or required secrets are unsafe.
- Do not describe audit rows as immutable or workflow jobs as fully durable unless the implementation proves that guarantee.

## Contracts and changes

- Define request and domain schemas in `packages/contracts`; derive TypeScript types from schemas where practical.
- Published workflow versions are immutable. Draft updates require optimistic concurrency.
- Mutating run or publication operations require stable idempotency keys.
- Large or sensitive values belong behind artifact references, not in events or logs.

## Completion requirements

- Run `pnpm security:secrets`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Add negative authorization or tenant-isolation tests for security-sensitive changes.
- Document migrations, operational impact, accessibility impact, and residual risk.
- Never fix failures by deleting tests, weakening authorization, broadening CORS, swallowing errors, or introducing `any`.
