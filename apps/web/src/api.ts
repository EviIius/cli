export type Message = { role: "system" | "user" | "assistant" | "tool"; content: unknown; meta?: string };
export type Principal = { userId: string; email: string; tenantId: string; role: "owner" | "admin" | "builder" | "viewer" };
export type AuthResult = { token: string; principal: Principal };
export type Trace = { id: string; startedAt: string; status: string; sessionId: string; spans: Array<{ id: string; name: string; kind: string; status: string; durationMs?: number; attributes: Record<string, string | number | boolean> }> };
export type Usage = { requests: number; inputTokens: number; outputTokens: number; costUsd: number };
export type Route = { provider: string; model: string; reason: string; traceId: string };
export type Session = { id: string; tenantId: string; createdAt: string; updatedAt: string; messages: Message[] };
export type Approval = { id: string; sessionId: string; traceId: string; toolName: string; input: unknown; status: "pending" | "approved" | "rejected"; requestedAt: string; resolvedAt?: string; reason?: string };
export type WorkflowStep = { id: string; name: string; prompt: string; modelHint?: string };
export type Job = { id: string; type: "single" | "planner-reviewer" | "adhoc"; status: string; input: Record<string, unknown>; state: Record<string, unknown>; result?: { output?: string; artifactId?: string }; error?: string; createdAt: string; updatedAt: string };
export type Prompt = { name: string; versions: string[]; aliases: Record<string, string> };
export type ProviderStatus = { id: string; provider?: string; model?: string; configured: boolean; capabilities?: { tools: boolean; structuredOutput: boolean; streaming: boolean; selfHosted: boolean }; health?: { ok: boolean; latencyMs: number; error?: string } };
export type AuditEvent = { id: string; tenantId: string; action: string; resourceType: string; resourceId?: string; actorId?: string; traceId?: string; metadata: Record<string, unknown>; createdAt: string };
export type Policy = { tenantId: string; allowedProviders: string[]; allowedModels?: string[]; externalProvidersAllowed: boolean; monthlyBudgetUsd: number; writeToolsRequireApproval: boolean };
export type Agent = { id: string; name: string; prompt: { name: string; version: string }; priority: string; tools: string[]; maxSteps: number };
export type EvalReport = { id: string; createdAt: string; passed: number; failed: number; passRate: number; results: Array<{ id: string; passed: boolean; output: string; latencyMs: number; reason?: string }> };
export type Artifact = { id: string; jobId?: string; sessionId?: string; name: string; mediaType: string; content: unknown; sizeBytes: number; createdAt: string };

let token = "";
try { token = globalThis.sessionStorage?.getItem("relay.token") ?? ""; } catch { token = ""; }
let principal: Principal | undefined;
export const setAuth = (next: AuthResult | null) => { token = next?.token ?? ""; principal = next?.principal; try { if (token) globalThis.sessionStorage?.setItem("relay.token", token); else globalThis.sessionStorage?.removeItem("relay.token"); } catch { /* ephemeral authentication remains usable */ } };
export const currentPrincipal = () => principal;
const headers = (json = false) => ({ ...(json ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) });

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...headers(Boolean(init?.body)), ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${response.status})`);
  return data as T;
}

export async function me(): Promise<Principal> { const value = await request<Principal>("/v1/auth/me"); principal = value; return value; }
export async function login(email: string, password: string): Promise<AuthResult> { const value = await request<AuthResult>("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); setAuth(value); return value; }
export async function bootstrap(email: string, password: string, name: string, tenantName: string): Promise<AuthResult> { const value = await request<AuthResult>("/v1/auth/bootstrap", { method: "POST", body: JSON.stringify({ email, password, name, tenantName }) }); setAuth(value); return value; }
export function logout() { setAuth(null); }
const tenantPath = (suffix: string) => { if (!principal) throw new Error("Authentication has not initialized"); return `/v1/tenants/${principal.tenantId}${suffix}`; };

export async function streamChat(sessionId: string, message: string, priority: string, agentId: string | undefined, modelHint: string | undefined, handlers: { route: (route: Route) => void; delta: (text: string) => void; approval?: (ids: string[]) => void }): Promise<void> {
  if (!principal) throw new Error("Authentication has not initialized");
  const response = await fetch("/v1/chat/stream", { method: "POST", headers: headers(true), body: JSON.stringify({ tenantId: principal.tenantId, sessionId, priority, agentId, modelHint, messages: [{ role: "user", content: message }] }) });
  if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? `Request failed (${response.status})`);
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
  while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const frames = buffer.split("\n\n"); buffer = frames.pop() ?? ""; for (const frame of frames) { const event = frame.match(/^event: (.+)$/m)?.[1], raw = frame.match(/^data: (.+)$/m)?.[1]; if (!event || !raw) continue; const data = JSON.parse(raw); if (event === "route") handlers.route(data); if (event === "delta") handlers.delta(data.text); if (event === "complete" && data.result?.pendingApprovals) handlers.approval?.(data.result.pendingApprovals.map((item: { id: string }) => item.id)); if (event === "error") throw new Error(data.error); } }
}
export const getTraces = () => request<Trace[]>(tenantPath("/traces"));
export const getUsage = () => request<Usage>(tenantPath("/usage"));
export const getSessions = () => request<Session[]>(tenantPath("/sessions"));
export const getSession = (id: string) => request<Session>(tenantPath(`/sessions/${id}`));
export const getApprovals = () => request<Approval[]>("/v1/approvals");
export const resolveApproval = (id: string, status: "approved" | "rejected", reason?: string) => request(`/v1/approvals/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, reason }) });
export const getJobs = () => request<Job[]>("/v1/jobs");
export const getJob = (id: string) => request<Job>(`/v1/jobs/${id}`);
export const createJob = (objective: string, type: Job["type"], priority: string) => request<Job>("/v1/jobs", { method: "POST", body: JSON.stringify({ objective, type, priority }) });
export const createAdhocJob = (objective: string, steps: WorkflowStep[]) => request<Job>("/v1/jobs", { method: "POST", body: JSON.stringify({ objective, type: "adhoc", priority: "deep", steps }) });
export const cancelJob = (id: string) => request<Job>(`/v1/jobs/${id}/cancel`, { method: "POST" });
export const getPrompts = () => request<Prompt[]>("/v1/prompts");
export const promotePrompt = (name: string, version: string) => request("/v1/prompts/promote", { method: "POST", body: JSON.stringify({ name, version, channel: "production" }) });
export const getProviders = () => request<{ providers: ProviderStatus[] }>("/v1/providers/status");
export const getAudit = () => request<AuditEvent[]>(tenantPath("/audit"));
export const getPolicy = () => request<Policy>(tenantPath("/policy"));
export const getAgents = () => request<Agent[]>("/v1/agents");
export const getEvals = () => request<EvalReport[]>("/v1/evals");
export const runEval = () => request<EvalReport>("/v1/evals/run", { method: "POST" });
export const replayTrace = (id: string) => request<{ result: { outputText?: string }; trace: Trace }>(`/v1/traces/${id}/replay`, { method: "POST" });
export const uploadArtifact = (sessionId: string, name: string, mediaType: string, content: unknown) => request<Artifact>("/v1/artifacts", { method: "POST", body: JSON.stringify({ sessionId, name, mediaType, content }) });
export const getArtifacts = () => request<Artifact[]>("/v1/artifacts");
