import { z } from "zod";

export const toolSpecSchema = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
  version:z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/).optional(),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()),
  mode: z.enum(["read", "write", "async"]),
  requiresApproval: z.boolean().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  maximumOutputBytes:z.number().int().positive().max(10_485_760).optional(),
  authMode: z.enum(["none", "tenant", "service"]).optional()
});
export type ToolSpec = z.infer<typeof toolSpecSchema>;

export type ToolContext = {
  tenantId: string;
  sessionId: string;
  traceId: string;
  approved: boolean;
  signal: AbortSignal;
};

export type ToolHandler = (input: unknown, context: ToolContext) => Promise<unknown>;
export type ToolExecution = {
  tool: string;
  status: "succeeded" | "failed" | "approval_required";
  output?: unknown;
  error?: string;
  durationMs: number;
};

export type ApprovalRecord = {
  id: string;
  tenantId: string;
  sessionId: string;
  traceId: string;
  toolCallId?: string;
  toolName: string;
  input: unknown;
  status: "pending" | "approved" | "rejected";
  operationKey?:string;
  executionStatus?:"not_started"|"executing"|"succeeded"|"failed";
  result?:unknown;
  resumedAt?:string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  reason?: string;
};
