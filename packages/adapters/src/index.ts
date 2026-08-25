export * from "./anthropic/index.js";
export * from "./demo/index.js";
export * from "./openai-compatible/index.js";
export * from "./openai/index.js";

import type { ModelAdapter } from "@relay/contracts";
import { AnthropicAdapter } from "./anthropic/index.js";
import { DemoAdapter } from "./demo/index.js";
import { OpenAICompatibleAdapter } from "./openai-compatible/index.js";
import { OpenAIResponsesAdapter } from "./openai/index.js";

export function adaptersFromEnvironment(env: NodeJS.ProcessEnv = process.env): ModelAdapter[] {
  const adapters: ModelAdapter[] = [];
  if (env.OPENAI_API_KEY) {
    adapters.push(new OpenAIResponsesAdapter({id:"openai:fast",model:env.OPENAI_FAST_MODEL??"gpt-5.6-luna",apiKey:env.OPENAI_API_KEY,baseUrl:env.OPENAI_BASE_URL??"https://api.openai.com/v1",inputCostPerMillion:1,outputCostPerMillion:6,reasoningEffort:"low"}));
    adapters.push(new OpenAIResponsesAdapter({id:"openai:balanced",model:env.OPENAI_BALANCED_MODEL??env.OPENAI_MODEL??"gpt-5.6-terra",apiKey:env.OPENAI_API_KEY,baseUrl:env.OPENAI_BASE_URL??"https://api.openai.com/v1",inputCostPerMillion:2.5,outputCostPerMillion:15,reasoningEffort:"medium"}));
    adapters.push(new OpenAIResponsesAdapter({id:"openai:deep",model:env.OPENAI_DEEP_MODEL??"gpt-5.6-sol",apiKey:env.OPENAI_API_KEY,baseUrl:env.OPENAI_BASE_URL??"https://api.openai.com/v1",inputCostPerMillion:5,outputCostPerMillion:30,reasoningEffort:"high"}));
  }
  if (env.ANTHROPIC_API_KEY) adapters.push(new AnthropicAdapter(env.ANTHROPIC_MODEL ?? "claude-sonnet-5", env.ANTHROPIC_API_KEY));
  if (env.MISTRAL_API_KEY) adapters.push(new OpenAICompatibleAdapter({ id: "mistral:balanced", provider: "mistral", model: env.MISTRAL_MODEL ?? "mistral-large-latest", apiKey: env.MISTRAL_API_KEY, baseUrl: env.MISTRAL_BASE_URL ?? "https://api.mistral.ai/v1", inputCostPerMillion: 0.5,outputCostPerMillion:1.5,selfHosted:env.MISTRAL_SELF_HOSTED==="true" }));
  if (env.QWEN_API_KEY) adapters.push(new OpenAICompatibleAdapter({ id: "qwen:balanced", provider: "qwen", model: env.QWEN_MODEL ?? "qwen3.7-max", apiKey: env.QWEN_API_KEY, baseUrl: env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", inputCostPerMillion: 2.5,outputCostPerMillion:7.5,selfHosted:env.QWEN_SELF_HOSTED==="true" }));
  if (env.GEMINI_API_KEY) {
    const baseUrl=env.GEMINI_BASE_URL??"https://generativelanguage.googleapis.com/v1beta/openai";
    adapters.push(new OpenAICompatibleAdapter({id:"gemini:fast",provider:"gemini",model:env.GEMINI_FAST_MODEL??"gemini-3.5-flash-lite",apiKey:env.GEMINI_API_KEY,baseUrl,inputCostPerMillion:.3,outputCostPerMillion:2.5}));
    adapters.push(new OpenAICompatibleAdapter({id:"gemini:balanced",provider:"gemini",model:env.GEMINI_MODEL??"gemini-3.6-flash",apiKey:env.GEMINI_API_KEY,baseUrl,inputCostPerMillion:1.5,outputCostPerMillion:7.5}));
  }
  if (env.GEMMA_API_KEY&&env.GEMMA_BASE_URL) adapters.push(new OpenAICompatibleAdapter({id:"gemma:balanced",provider:"gemma",model:env.GEMMA_MODEL??"google/gemma-4-E4B-it",apiKey:env.GEMMA_API_KEY,baseUrl:env.GEMMA_BASE_URL,inputCostPerMillion:0,outputCostPerMillion:0,selfHosted:env.GEMMA_SELF_HOSTED==="true",timeoutMs:Number(env.GEMMA_TIMEOUT_MS??120000)}));
  if (env.LOCAL_BASE_URL !== "disabled") adapters.push(new OpenAICompatibleAdapter({id:"local:qwen3-8b",provider:"local",model:env.LOCAL_MODEL??"qwen3:8b",apiKey:env.LOCAL_API_KEY??"ollama",baseUrl:env.LOCAL_BASE_URL??"http://127.0.0.1:11434/v1",inputCostPerMillion:0,outputCostPerMillion:0,selfHosted:true,timeoutMs:Number(env.LOCAL_TIMEOUT_MS??120000)}));
  adapters.push(new DemoAdapter());
  return adapters;
}
