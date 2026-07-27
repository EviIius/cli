# Relay Control Plane

Relay is a provider-agnostic chatbot and agent control plane with policy routing, durable multi-tenant state, human approval gates, recoverable workflows, evals, observability, and both managed and private model inference.

## Quick start

Requirements: Node.js 22+, pnpm 11+, Docker Desktop, and optionally an NVIDIA GPU.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm local:setup
pnpm dev
```

Open `http://localhost:5173`. With `AUTH_MODE=optional`, a development owner is supplied automatically. For a real login flow set `AUTH_MODE=required`, replace `AUTH_SECRET`, and use the UI's first-run bootstrap form. The local Qwen route and deterministic demo route require no paid API key.

## Verification

```powershell
pnpm typecheck
pnpm test
$env:DATABASE_URL='postgresql://relay:relay@localhost:5432/relay'; pnpm test:integration
pnpm eval
pnpm build
pnpm providers:verify
pnpm providers:verify -- --live # sends one minimal, billable completion per configured provider
```

## Production containers

Set a strong `AUTH_SECRET` and production database/provider secrets in an uncommitted `.env`, then:

```powershell
docker compose --profile app up -d --build
```

The console is at `http://localhost:8080`, API at `http://localhost:4100`, and Jaeger at `http://localhost:16686`. Kubernetes templates live in `infra/kubernetes`; replace all sample image names, hosts, and secrets before applying them.

## Host Relay online with Render

Relay includes a `render.yaml` Blueprint that deploys the web console and API as one Docker service, creates a private PostgreSQL database, runs migrations before every release, generates the authentication secret, and keeps promoted prompts on a persistent disk.

### Free demo option

Use `render.free.yaml` as the Blueprint path for a $0 demo deployment. It uses Render's Free web service and Free PostgreSQL plans. The free service sleeps after 15 minutes without traffic and can take about a minute to wake. The database is limited to 1 GB, expires after 30 days, and has no backups. Free services cannot attach the prompt disk, so prompt promotions reset after a restart or redeploy. With a payment card on the workspace, excess bandwidth or build minutes can still be billed; configure a workspace spend limit before deploying if zero spend is required.

Use the default `render.yaml` when the service needs to stay awake, retain prompt promotions, preserve the database beyond 30 days, and support backups. Moving from the free experiment to the paid Blueprint requires migrating data or starting with a new managed database.

1. Keep `.env` local. Never commit it. Hosted secrets are entered in Render, not copied into source files.
2. Commit and push this repository to GitHub or GitLab. The `render.yaml` file must be on the branch Render deploys.
3. Sign in at <https://dashboard.render.com>, choose **New > Blueprint**, and connect this repository. Set the Blueprint path to `render.free.yaml` for the demo tier or leave it as `render.yaml` for persistent hosting.
4. Review the `relay-control-plane` web service and `relay-postgres` database. The defaults use paid persistent plans; change them only after reviewing Render's durability limitations.
5. When Render asks for `OPENAI_API_KEY`, paste the key from your local `.env`. Render generates `AUTH_SECRET` and obtains `DATABASE_URL` from the managed database automatically.
6. Apply the Blueprint and wait until `/ready` passes. Open the generated `onrender.com` URL.
7. On the first visit, create the owner account and tenant. Store that password in a password manager; bootstrap closes after the first account is created.
8. Send a test message, then verify Sessions, Traces, Usage, and Models. Add a custom domain in Render only after this test succeeds.

Do not upload the complete `.env` file to Render: it contains local-only values such as the localhost model address. Add additional Anthropic, Mistral, or Qwen keys individually in the service's Environment page.

## Local failover when the hosted service is unavailable

The local installation is an independent fallback, not an automatic replica. It continues operating with Ollama and `qwen3:8b` even when hosted inference is unavailable, but hosted conversations do not automatically appear locally.

Prepare once while internet access is available:

```powershell
pnpm install
pnpm local:setup
docker compose pull postgres redis
```

During an outage, run:

```powershell
pnpm fallback:start
```

Open `http://localhost:5173` and choose the **private** routing lane to force local Qwen inference. The command starts PostgreSQL and Redis, applies migrations, verifies Ollama, and starts the application. Press `Ctrl+C` to stop the app; its database remains available in the Docker volume.

If the machine is offline and Ollama was already verified, skip the model pull/check:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-failover.ps1 -SkipModelCheck
```

For a production-shaped, entirely containerized fallback, first replace the placeholder `AUTH_SECRET` in `.env`, then run:

```powershell
docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile app up -d --build
```

Open `http://localhost:8080`. The first run downloads the local model into the `relay_ollama` volume, so perform it before an outage. Stop the fallback without deleting its databases or model cache with the same Compose files plus `stop`; never add `-v` unless you intentionally want to delete local state.

For disaster recovery rather than temporary failover, enable managed PostgreSQL backups and periodically test restoring a hosted backup into the local PostgreSQL instance. Automatic hosted-to-local replication and DNS failover are not configured by this repository.

## What is implemented

- OpenAI Responses, Anthropic Messages, Mistral/Qwen OpenAI-compatible, Ollama/vLLM, and offline demo adapters
- Native SSE token streaming, transient retries, ordered fallback, capability/policy filtering, token usage, and cost accounting
- PostgreSQL sessions, messages, traces, usage, policies, audit events, approvals, jobs, and artifacts with checksummed migrations
- Signed authentication, tenant RBAC, per-tenant rate limits and budgets, input redaction, and retention purge controls
- Persisted write-tool approvals and resumable single or planner–executor–reviewer workflows
- Versioned prompt promotion, deterministic evaluation reports, OpenTelemetry export, CI, production containers, and Kubernetes/HPA manifests
- Responsive operator console for chat, history, traces, approvals, workflows, prompts, usage, providers, policy, and audit activity
- Agent graph registry, trace replay, persisted eval dashboard, budget alerts, and text-file artifact attachments

See [provider setup](docs/providers.md), [deployment](docs/deployment.md), [architecture](docs/architecture.md), and [security](docs/security.md).
