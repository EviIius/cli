# Deployment

## Managed hosting on Render

The root `render.yaml` is the supported single-region managed deployment. It builds the API Dockerfile with the React console embedded, provisions private PostgreSQL, runs checksummed migrations as a pre-deploy command, uses `/ready` as the health check, generates `AUTH_SECRET`, prompts for `OPENAI_API_KEY`, and mounts a persistent prompt-registry disk. Create a Blueprint from the repository in Render and complete the first-user bootstrap only after the deployment is healthy.

For a disposable demo, select `render.free.yaml` as the Blueprint path. Because Render does not offer pre-deploy commands or persistent disks on Free web services, this variant runs idempotent migrations during startup and uses the image's bundled prompt registry. It will cold-start after idle periods, loses prompt-file changes on restart, and must be upgraded or migrated before its Free PostgreSQL database expires after 30 days.

The hosted service deliberately sets `LOCAL_BASE_URL=disabled`: `127.0.0.1` on a cloud container is not the workstation's Ollama service. If private hosted inference is required later, deploy vLLM or Ollama inside the same private cloud network and point `LOCAL_BASE_URL` at that private endpoint.

## Local production-shaped stack

Generate a secret (for example, `openssl rand -base64 48`), put it in uncommitted `.env` as `AUTH_SECRET`, and run `docker compose --profile app up -d --build`. A one-shot migration service gates API startup. Jaeger is exposed on port 16686.

For outage operation with no managed model dependency, use the Ollama overlay: `docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile app up -d --build`. Run this once before it is needed so the images and model weights are already cached. The local state is separate from Render PostgreSQL unless an operator restores a backup manually.

## Kubernetes

Build and push `infra/docker/api.Dockerfile` and `infra/docker/web.Dockerfile`, replace image references and the host in `infra/kubernetes`, and supply secrets through the cluster's secret manager. The templates include two replicas, health probes, resource limits, and API CPU autoscaling. PostgreSQL, Redis, and the OpenTelemetry collector are expected as managed or separately installed services.

## Private inference

For this Windows workstation use Ollama and `qwen3:8b`; `docker-compose.ollama.yml` runs it on the application network. For Linux NVIDIA production, set `LOCAL_BASE_URL=http://vllm:8000/v1`, `LOCAL_API_KEY`, and `LOCAL_MODEL=qwen3-8b`, then start the application and vLLM on one network with `docker compose -f docker-compose.yml -f docker-compose.vllm.yml --profile app up -d --build`. Place inference behind a private network; do not expose its OpenAI-compatible port publicly.

## Rollout

Run migrations, unit/integration tests, the smoke eval, and image scanning before rollout. Deploy the API, confirm `/ready`, deploy the web console, send a canary chat through each enabled lane, and verify traces reach Jaeger. Roll back application images independently; database migrations in this repository are additive.
