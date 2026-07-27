import type { ChatRequest, ModelAdapter, TenantPolicy } from "@relay/contracts";

export type RouteDecision = { adapter: ModelAdapter; reason: string; considered: string[] };

const laneCandidates: Record<ChatRequest["priority"], string[]> = {
  fast: ["openai:fast", "mistral:balanced", "local:qwen3-8b", "demo:relay"],
  balanced: ["openai:balanced", "anthropic:balanced", "mistral:balanced", "qwen:balanced", "local:qwen3-8b", "demo:relay"],
  deep: ["openai:deep", "anthropic:balanced", "qwen:balanced", "openai:balanced", "mistral:balanced", "local:qwen3-8b", "demo:relay"],
  private: ["local:qwen3-8b", "demo:relay"]
};

export class PolicyRouter {
  constructor(private readonly adapters: ModelAdapter[]) {}

  route(request: ChatRequest, policy: TenantPolicy): RouteDecision {
    const candidates=this.routes(request,policy); if(!candidates.length)throw new Error("No eligible model route"); return candidates[0]!;
  }

  routes(request: ChatRequest, policy: TenantPolicy): RouteDecision[] {
    const needsTools = Boolean(request.tools?.length);
    const needsStructured = Boolean(request.responseSchema);
    const byId = new Map(this.adapters.map((adapter) => [adapter.id, adapter]));
    const ordered = request.modelHint
      ? [request.modelHint, ...laneCandidates[request.priority].filter((id) => id !== request.modelHint)]
      : laneCandidates[request.priority];
    const considered: string[] = [];
    const decisions:RouteDecision[]=[];
    for (const id of ordered) {
      const adapter = byId.get(id);
      if (!adapter) { considered.push(`${id}: unavailable`); continue; }
      if (!policy.allowedProviders.includes(adapter.provider)) { considered.push(`${id}: provider blocked`); continue; }
      if (policy.allowedModels?.length && !policy.allowedModels.includes(adapter.model)) { considered.push(`${id}: model blocked`); continue; }
      if (!policy.externalProvidersAllowed && !adapter.capabilities.selfHosted) { considered.push(`${id}: external blocked`); continue; }
      if (request.priority === "private" && !adapter.capabilities.selfHosted) { considered.push(`${id}: not self-hosted`); continue; }
      if (needsTools && !adapter.capabilities.tools) { considered.push(`${id}: tools unsupported`); continue; }
      if (needsStructured && !adapter.capabilities.structuredOutput) { considered.push(`${id}: schema unsupported`); continue; }
      if (!adapter.supports(request)) { considered.push(`${id}: not configured`); continue; }
      decisions.push({ adapter, considered:[...considered], reason: `${request.priority} lane selected ${adapter.id}; tenant and capability checks passed` });
    }
    if(!decisions.length)throw new Error(`No eligible model route. ${considered.join("; ")}`);
    return decisions;
  }
}
