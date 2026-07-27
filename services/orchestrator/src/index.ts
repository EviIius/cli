import { randomUUID } from "node:crypto";
import type { AgentDefinition, ChatMessage, ChatRequest, ChatResult, ModelAdapter, TenantPolicy, Trace, TraceSpan } from "@relay/contracts";
import type { ToolRunner } from "@relay/tool-runner";
import { PolicyRouter } from "./router/index.js";
import { MemoryStore, type RelayStore } from "./store.js";
import type { PromptRegistry } from "./prompts/registry.js";
import { redactValue, safeError } from "./security.js";
export * from "./postgres-store.js";
export * from "./prompts/registry.js";
export * from "./router/index.js";
export * from "./store.js";
export * from "./security.js";

export class Orchestrator {
  readonly router: PolicyRouter;
  constructor(adapters: ModelAdapter[], readonly tools: ToolRunner, readonly store: RelayStore = new MemoryStore(), private readonly policyFor?: (tenantId: string) => Promise<TenantPolicy>, private readonly prompts?:PromptRegistry) { this.router = new PolicyRouter(adapters); }

  private async invoke(adapter: ModelAdapter, request: ChatRequest, onDelta?: (text: string) => void): Promise<ChatResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (onDelta && adapter.invokeStream) {
          let result: ChatResult | undefined;
          for await (const event of adapter.invokeStream(request)) { if (event.type === "delta") onDelta(event.text); else result = event.result; }
          if (!result) throw new Error("Provider stream produced no final result");
          return result;
        }
        return await adapter.invoke(request);
      } catch (error) {
        lastError = error;
        if (!Boolean((error as { retryable?: boolean })?.retryable) || attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async run(input: ChatRequest, events?: { onDelta?: (text: string) => void; agent?: AgentDefinition }): Promise<{ result: ChatResult; trace: Trace }> {
    const traceId = randomUUID();
    const startedAt = new Date().toISOString();
    const trace: Trace = { id: traceId, tenantId: input.tenantId, sessionId: input.sessionId, startedAt, status: "running", spans: [] };
    const addSpan = (span: Omit<TraceSpan, "id" | "traceId" | "startedAt"> & { startedAt?: string }) => trace.spans.push({ id: randomUUID(), traceId, startedAt: span.startedAt ?? new Date().toISOString(), ...span });
    const policy = this.policyFor ? await this.policyFor(input.tenantId) : await this.store.tenantPolicy(input.tenantId);
    try {
      const session = await this.store.session(input.tenantId, input.sessionId);
      await this.store.saveTrace(trace);
      const usage = await this.store.usageSummary(input.tenantId);
      if (usage.costUsd >= policy.monthlyBudgetUsd) throw new Error(`Tenant monthly budget of $${policy.monthlyBudgetUsd.toFixed(2)} has been reached`);
      const agent = events?.agent;
      if (agent) addSpan({ name: `agent ${agent.id}`, kind: "policy", status: "ok", attributes: { prompt: `${agent.prompt.name}@${agent.prompt.version}`, maxSteps: agent.maxSteps, tools: agent.tools.join(",") } });
      const routeStart = performance.now();
      const decisions = this.router.routes(input, policy);
      let decision = decisions[0]!;
      addSpan({ name: "select model", kind: "router", status: "ok", durationMs: performance.now() - routeStart, attributes: { adapter: decision.adapter.id, reason: decision.reason, candidates: decisions.length } });
      const messages: ChatMessage[] = [...session.messages, ...input.messages];
      if(this.prompts&&!messages.some(message=>message.role==="system")){const prompt=await this.prompts.resolve(agent?.prompt.name??"chat",agent?.prompt.version);messages.unshift({role:"system",content:prompt.content});addSpan({name:`prompt ${prompt.name}`,kind:"policy",status:"ok",attributes:{version:prompt.version}});}
      const availableTools = this.tools.specs();
      const agentTools = agent ? availableTools.filter((tool) => agent.tools.includes(tool.name)) : availableTools;
      let request = { ...input, messages, tools: agent ? agentTools : input.tools ?? availableTools };
      let result: ChatResult | undefined;
      const pendingApprovals:Array<{id:string;toolName:string}>=[];
      modelLoop: for (let step = 0; step < (agent?.maxSteps ?? 4); step += 1) {
        const modelStart = performance.now();
        let invocationError: unknown;
        for (const candidate of [decision, ...decisions.filter((item) => item.adapter.id !== decision.adapter.id)]) {
          try { result = await this.invoke(candidate.adapter, request, events?.onDelta); decision = candidate; invocationError = undefined; break; }
          catch (error) { invocationError = error; addSpan({ name: `model ${candidate.adapter.id} failed`, kind: "model", status: "error", durationMs: performance.now() - modelStart, attributes: { adapter: candidate.adapter.id, error: safeError(error) } }); }
        }
        if (invocationError || !result) throw invocationError ?? new Error("All provider routes failed");
        addSpan({ name: `model ${decision.adapter.id}`, kind: "model", status: "ok", durationMs: performance.now() - modelStart, attributes: { provider: result.provider, model: result.model, step } });
        if (!result.toolCalls?.length) break;
        messages.push({ role: "assistant", content: "", toolCalls: result.toolCalls });
        for (const call of result.toolCalls) {
          const execution = await this.tools.execute(call.name, call.arguments, { tenantId: input.tenantId, sessionId: input.sessionId, traceId, approved: false }, policy);
          addSpan({ name: `tool ${call.name}`, kind: "tool", status: execution.status === "failed" ? "error" : "ok", durationMs: execution.durationMs, attributes: { status: execution.status } });
          if(execution.status==="approval_required"){
            const approval=await this.store.createApproval({tenantId:input.tenantId,sessionId:input.sessionId,traceId,toolCallId:call.id,toolName:call.name,input:call.arguments});
            pendingApprovals.push({id:approval.id,toolName:approval.toolName});
            await this.store.addAudit({tenantId:input.tenantId,actorId:input.metadata?.actorId,action:"approval.requested",resourceType:"approval",resourceId:approval.id,traceId,metadata:{toolName:call.name}});
            continue;
          }
          messages.push({ role: "tool", name: call.name, toolCallId: call.id, content: execution.status === "succeeded" ? execution.output : { status: execution.status, error: execution.error } });
        }
        if(pendingApprovals.length)break modelLoop;
        request = { ...request, messages };
      }
      if (!result) throw new Error("Model produced no result");
      result = { ...result, traceId, routeReason: decision.reason, pendingApprovals:pendingApprovals.length?pendingApprovals:undefined, outputText:pendingApprovals.length?`Waiting for approval to run ${pendingApprovals.map(item=>item.toolName).join(", ")}.`:result.outputText };
      if (result.outputText&&!pendingApprovals.length) messages.push({ role: "assistant", content: result.outputText });
      await this.store.saveMessages(input.tenantId, input.sessionId, redactValue(messages) as ChatMessage[]);
      trace.status = "ok";
      await this.store.saveTrace(trace);
      await this.store.addUsage({ id: randomUUID(), tenantId: input.tenantId, sessionId: input.sessionId, traceId, provider: result.provider, model: result.model, inputTokens: Math.ceil(result.usage?.inputTokens ?? 0), outputTokens: Math.ceil(result.usage?.outputTokens ?? 0), costUsd: result.usage?.costUsd ?? 0, createdAt: new Date().toISOString() });
      await this.store.addAudit({ tenantId: input.tenantId, actorId: input.metadata?.actorId, action: "chat.completed", resourceType: "session", resourceId: input.sessionId, traceId, metadata: { provider: result.provider, model: result.model, agentId: agent?.id ?? "default" } });
      return { result, trace };
    } catch (error) {
      trace.status = "error";
      addSpan({ name: "orchestration error", kind: "request", status: "error", attributes: { error: safeError(error) } });
      await this.store.saveTrace(trace);
      await this.store.addAudit({ tenantId: input.tenantId, actorId: input.metadata?.actorId, action: "chat.failed", resourceType: "session", resourceId: input.sessionId, traceId, metadata: { error: safeError(error) } });
      throw error;
    }
  }

  async resolveApproval(id:string,tenantId:string,actorId:string,status:"approved"|"rejected",reason?:string):Promise<{approval:import("@relay/contracts").ApprovalRecord;resumed?:Awaited<ReturnType<Orchestrator["run"]>>}>{
    const existing=await this.store.approval(id);if(!existing||existing.tenantId!==tenantId)throw new Error("Approval not found");
    const approval=await this.store.resolveApproval(id,status,actorId,reason);
    await this.store.addAudit({tenantId,actorId,action:`approval.${status}`,resourceType:"approval",resourceId:id,traceId:approval.traceId,metadata:{toolName:approval.toolName,reason:reason??""}});
    const remaining=(await this.store.listApprovals(tenantId,"pending")).filter(item=>item.sessionId===approval.sessionId);if(remaining.length)return{approval};
    let content:unknown={status:"rejected",reason:reason??"Rejected by operator"};
    if(status==="approved"){
      const policy=this.policyFor?await this.policyFor(tenantId):await this.store.tenantPolicy(tenantId);
      const execution=await this.tools.execute(approval.toolName,approval.input,{tenantId,sessionId:approval.sessionId,traceId:approval.traceId,approved:true},policy);
      content=execution.status==="succeeded"?execution.output:{status:execution.status,error:execution.error};
    }
    const resumed=await this.run({tenantId,sessionId:approval.sessionId,priority:"balanced",messages:[{role:"tool",name:approval.toolName,toolCallId:approval.toolCallId,content}],metadata:{actorId}});
    return{approval,resumed};
  }
}
