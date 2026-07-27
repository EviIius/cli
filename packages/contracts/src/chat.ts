import { z } from "zod";
import { toolSpecSchema } from "./tools.js";

export const providerSchema = z.enum(["openai", "anthropic", "mistral", "qwen", "gemini", "gemma", "meta", "local", "demo"]);
export type Provider = z.infer<typeof providerSchema>;

export const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.unknown(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(z.object({ id: z.string().optional(), name: z.string(), arguments: z.unknown() })).optional()
});
export type ChatMessage = z.infer<typeof messageSchema>;

export const chatRequestSchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  modelHint: z.string().optional(),
  priority: z.enum(["fast", "balanced", "deep", "private"]).default("balanced"),
  messages: z.array(messageSchema).min(1),
  tools: z.array(toolSpecSchema).optional(),
  responseSchema: z.record(z.unknown()).optional(),
  metadata: z.record(z.string()).optional()
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ToolCall = { id?: string; name: string; arguments: unknown };
export type ChatResult = {
  model: string;
  provider: Provider;
  outputText?: string;
  structured?: unknown;
  toolCalls?: ToolCall[];
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  traceId: string;
  routeReason?: string;
  pendingApprovals?: Array<{ id: string; toolName: string }>;
};

export type AdapterCapabilities = {
  tools: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  selfHosted: boolean;
};
export type AdapterStreamEvent = { type: "delta"; text: string } | { type: "result"; result: ChatResult };
export type AdapterHealth = { ok: boolean; latencyMs: number; error?: string };

export interface ModelAdapter {
  readonly id: string;
  readonly provider: Provider;
  readonly model: string;
  readonly capabilities: AdapterCapabilities;
  readonly estimatedInputCostPerMillion: number;
  readonly estimatedOutputCostPerMillion: number;
  supports(request: ChatRequest): boolean;
  invoke(request: ChatRequest): Promise<ChatResult>;
  invokeStream?(request: ChatRequest): AsyncGenerator<AdapterStreamEvent>;
  health?(): Promise<AdapterHealth>;
}
