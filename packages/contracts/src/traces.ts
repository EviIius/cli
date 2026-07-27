export type SpanStatus = "running" | "ok" | "error";
export type TraceSpan = {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  kind: "request" | "router" | "model" | "tool" | "policy";
  status: SpanStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
};
export type Trace = {
  id: string;
  tenantId: string;
  sessionId: string;
  startedAt: string;
  status: SpanStatus;
  spans: TraceSpan[];
};
