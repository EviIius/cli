export type UsageRecord = {
  id: string;
  tenantId: string;
  sessionId: string;
  traceId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
};
export type UsageSummary = { requests: number; inputTokens: number; outputTokens: number; costUsd: number };
