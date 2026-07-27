# Provider and local-model setup

Relay runs with the local demo adapter without credentials. Configure only the managed providers you intend to use; the router skips unconfigured providers.

Never paste keys into the web app, source files, chat, screenshots, or committed configuration. Copy `.env.example` to `.env`, enter secrets there, and run `pnpm providers:verify`. This checks authentication without consuming model tokens. Then run `pnpm providers:verify -- --live` to send one minimal billable completion to each configured provider and verify quota plus model access. The `.env` file is ignored by Git.

## OpenAI

1. Create or select an API Platform project at <https://platform.openai.com/settings/organization/projects>.
2. Add billing and set a project budget.
3. Create a restricted project key at <https://platform.openai.com/api-keys>.
4. Set `OPENAI_API_KEY` in `.env`.

Relay uses the Responses API. Its default lanes are `gpt-5.6-luna` for fast traffic, `gpt-5.6-terra` for balanced traffic, and `gpt-5.6-sol` for deep work.

## Anthropic

1. Open <https://console.anthropic.com/settings/keys> and create a workspace key.
2. Ensure the workspace has billing or credits.
3. Set `ANTHROPIC_API_KEY` in `.env`.

The default is the pinned `claude-sonnet-5` model ID.

## Mistral

1. Activate Mistral Studio and open <https://console.mistral.ai/api-keys/>.
2. Create an expiring workspace key.
3. Set `MISTRAL_API_KEY` in `.env`.

## Qwen / Alibaba Cloud Model Studio

1. Activate Model Studio in the region where requests should run.
2. Create a workspace API key and record the region-specific OpenAI-compatible base URL.
3. Set `QWEN_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL` in `.env`.

The key and base URL must come from the same region. New workspace keys may only be shown once.

## Local Ollama

On Windows, run:

```powershell
pnpm local:setup
```

This installs Ollama if needed, starts its local service, downloads `qwen3:8b`, and checks the OpenAI-compatible endpoint. Relay connects to `http://127.0.0.1:11434/v1`. Set `LOCAL_BASE_URL=disabled` to remove the local route.

For this workstation's 8 GB GPU, `qwen3:8b` is the default. `gpt-oss:20b` is an optional higher-quality model but its approximately 14 GB quantized weights require CPU/RAM offload and will be substantially slower.

To keep Ollama inside the same Docker network as the production-shaped stack, use:

```powershell
docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile app up -d --build
```

The one-shot pull service downloads the configured model before the API starts. Port 11435 exposes this containerized Ollama instance to the host without colliding with the Windows service on 11434.

## Production vLLM

On a Linux NVIDIA host, use the `local-model` Compose profile or Kubernetes deployment to expose vLLM's OpenAI-compatible server. Set `LOCAL_BASE_URL` to that server and `LOCAL_MODEL` to its served model ID. Gated Hugging Face models additionally require `HF_TOKEN` and acceptance of their model license.
