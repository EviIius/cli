---
description: Implement a security containment change without weakening tenant or auth boundaries.
---
Read `AGENTS.md`, `docs/security.md`, and `docs/threat-model.md`. Trace the request through contracts, API authorization, repository tenant predicates, PostgreSQL RLS, audit behavior, and negative tests. Use additive migrations only. Run secret scanning, type checks, targeted tests, the full suite, and the dependency audit. Report residual risk explicitly.
