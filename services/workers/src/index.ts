import { randomUUID } from "node:crypto";
import type { JobRecord,WorkflowDefinition } from "@relay/contracts";
import type { Orchestrator, RelayStore } from "@relay/orchestrator";
export * from "./eval.js";

export type WorkflowStep = { id: string; name: string; prompt: string; modelHint?: string };
export type WorkflowInput = { objective: string; sessionId?: string; priority?: "fast" | "balanced" | "deep" | "private"; steps?: WorkflowStep[];definition?:WorkflowDefinition;nodeOrder?:string[];runInput?:Record<string,unknown>;workflowVersionId?:string };

export class WorkflowEngine {
  private readonly active = new Set<string>();
  private readonly workerId = randomUUID();
  constructor(private readonly orchestrator: Orchestrator, private readonly store: RelayStore) {}

  async submit(tenantId: string, actorId: string, type: JobRecord["type"], input: WorkflowInput,jobId?:string): Promise<JobRecord> {
    if (!input.objective?.trim()) throw new Error("objective is required");
    if (type === "adhoc") {
      if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 8) throw new Error("adhoc workflows require 1 to 8 steps");
      for (const step of input.steps) if (!step?.id?.trim() || !step?.name?.trim() || !step?.prompt?.trim()) throw new Error("each workflow step requires id, name, and prompt");
    }
    if(type==="graph"&&(!input.definition||!input.nodeOrder?.length))throw new Error("graph workflows require a definition and compiled node order");
    const job = await this.store.createJob({ id:jobId,tenantId, actorId, type, input: input as unknown as Record<string, unknown> });
    setTimeout(() => void this.execute(job.id,tenantId), 0);
    return job;
  }
  async recover(tenantId: string): Promise<void> { const jobs = [...await this.store.listJobs(tenantId, "queued"), ...await this.store.listJobs(tenantId, "running")]; await Promise.all(jobs.map((job) => this.execute(job.id,tenantId))); }
  async recoverAll(): Promise<void> { const jobs = await this.store.recoverableJobs(); await Promise.all(jobs.map((job) => this.execute(job.id,job.tenantId))); }
  async cancel(id: string, tenantId: string): Promise<JobRecord> { const job = await this.store.job(tenantId,id); if (!job) throw new Error("Job not found"); if (["succeeded", "failed", "cancelled"].includes(job.status)) return job; return await this.store.updateJob(tenantId,id, { status: "cancelled" }); }
  async resumeForApproval(tenantId: string, approvalId: string): Promise<void> { const waiting = await this.store.listJobs(tenantId, "waiting_approval"); const matches = waiting.filter((job) => Array.isArray(job.state.approvalIds) && (job.state.approvalIds as unknown[]).includes(approvalId)); await Promise.all(matches.map(async (job) => { await this.store.updateJob(tenantId,job.id, { status: "queued", state: { ...job.state, approvalIds: [] } }); await this.execute(job.id,tenantId); })); }

  async execute(id: string,tenantId:string): Promise<void> {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      let job = await this.store.claimJob(tenantId,id, this.workerId);
      if (!job || job.status === "cancelled") return;
      const input = job.input as unknown as WorkflowInput, sessionId = String(job.state.sessionId ?? input.sessionId ?? randomUUID());let lastTraceId=String(job.state.lastTraceId??"");
      const ask = async (content: string, modelHint?: string) => {
        const current = await this.store.job(tenantId,id); if (current?.status === "cancelled") throw new Error("JOB_CANCELLED");
        const response = await this.orchestrator.run({ tenantId: job!.tenantId, sessionId, priority: input.priority ?? "deep", modelHint, messages: [{ role: "user", content }], metadata: { actorId: job!.actorId ?? "" } });
        lastTraceId=response.trace.id;
        if (response.result.pendingApprovals?.length) { await this.store.updateJob(tenantId,id, { status: "waiting_approval", state: { ...job!.state, sessionId, approvalIds: response.result.pendingApprovals.map((item) => item.id) } }); throw new Error("JOB_WAITING_APPROVAL"); }
        return response.result.outputText ?? "";
      };
      let final: string;
      if (job.type === "single") final = await ask(input.objective);
      else if (job.type === "planner-reviewer") {
        const plan = typeof job.state.plan === "string" ? job.state.plan : await ask(`Act as a planner. Produce a concrete, ordered plan for this objective:\n${input.objective}`);
        job = await this.store.updateJob(tenantId,id, { state: { ...job.state, stage: "planned", sessionId, plan } });
        const draft = typeof job.state.draft === "string" ? job.state.draft : await ask(`Act as the executor. Complete the objective using this plan.\nObjective: ${input.objective}\nPlan:\n${plan}`);
        job = await this.store.updateJob(tenantId,id, { state: { ...job.state, stage: "executed", draft } });
        final = await ask(`Act as a strict reviewer. Return an improved final answer that corrects omissions or errors.\nObjective: ${input.objective}\nDraft:\n${draft}`);
        job = await this.store.updateJob(tenantId,id, { state: { ...job.state, stage: "reviewed", review: final } });
      } else if(job.type==="graph"){
        const definition=input.definition!,nodes=new Map(definition.nodes.map(node=>[node.id,node])),outputs={...((job.state.nodeOutputs as Record<string,unknown>|undefined)??{})},order=input.nodeOrder!,start=Number(job.state.nodeIndex??0);let previous:unknown=start?job.state.previousOutput:input.runInput??{};final="";
        for(let index=start;index<order.length;index+=1){const node=nodes.get(order[index]!);if(!node)throw new Error(`Compiled node ${order[index]} is missing`);job=await this.store.updateJob(tenantId,id,{state:{...job.state,stage:`running ${node.name}`,nodeIndex:index,currentStepId:node.id,currentStepName:node.name,sessionId,lastTraceId,nodeOutputs:outputs,previousOutput:previous}});await this.store.addAudit({tenantId,actorId:job.actorId,action:"workflow.node.started",resourceType:"job",resourceId:id,metadata:{jobId:id,nodeId:node.id,nodeType:node.type,index}});if(node.type==="trigger.manual")previous=input.runInput??{};else if(node.type==="ai.prompt"||node.type==="agent.custom"){const prompt=String(node.config.prompt??`Complete the ${node.name} step.`),modelHint=typeof node.config.modelHint==="string"?node.config.modelHint:undefined;previous=await ask(`${prompt}\n\nWorkflow input:\n${JSON.stringify(input.runInput??{},null,2)}\n\nPrevious node output:\n${JSON.stringify(previous,null,2)}`,modelHint);}else if(node.type==="human.approval"){const approvalId=typeof job.state.humanApprovalId==="string"?job.state.humanApprovalId:"";if(approvalId){const approval=await this.store.approval(tenantId,approvalId);if(!approval||approval.status==="pending"){await this.store.updateJob(tenantId,id,{status:"waiting_approval"});throw new Error("JOB_WAITING_APPROVAL");}if(approval.status==="rejected"){final=`Workflow rejected: ${approval.reason??"No reason supplied"}`;previous=final;break;}}else{if(!lastTraceId)throw new Error("Human approval requires a prior traced node");const approval=await this.store.createApproval({tenantId,sessionId,traceId:lastTraceId,toolName:"human.approval",input:{workflowVersionId:input.workflowVersionId,nodeId:node.id,subject:previous},operationKey:`graph:${id}:${node.id}`});await this.store.updateJob(tenantId,id,{status:"waiting_approval",state:{...job.state,humanApprovalId:approval.id,nodeIndex:index,sessionId,lastTraceId,nodeOutputs:outputs,previousOutput:previous,approvalIds:[approval.id]}});await this.store.addAudit({tenantId,actorId:job.actorId,action:"approval.requested",resourceType:"approval",resourceId:approval.id,traceId:lastTraceId,metadata:{kind:"human",jobId:id,workflowVersionId:input.workflowVersionId??"",nodeId:node.id}});throw new Error("JOB_WAITING_APPROVAL");}}else if(node.type==="integration.http")throw new Error("HTTP integration nodes require a configured connection and isolated connector worker");else if(node.type==="output.response")final=typeof previous==="string"?previous:JSON.stringify(previous,null,2);outputs[node.id]=previous;job=await this.store.updateJob(tenantId,id,{state:{...job.state,stage:`completed ${node.name}`,nodeIndex:index+1,currentStepId:"",currentStepName:"",sessionId,lastTraceId,nodeOutputs:outputs,previousOutput:previous,humanApprovalId:"",approvalIds:[]}});await this.store.addAudit({tenantId,actorId:job.actorId,action:"workflow.node.completed",resourceType:"job",resourceId:id,metadata:{jobId:id,nodeId:node.id,nodeType:node.type,index}});}final ||= typeof previous==="string"?previous:JSON.stringify(previous,null,2);
      } else {
        let previous = "";
        const outputs: Array<WorkflowStep & { output: string }> = [];
        for (const [index, step] of (input.steps ?? []).entries()) {
          job = await this.store.updateJob(tenantId,id, { state: { ...job.state, stage: `running step ${index + 1} of ${input.steps!.length}`, currentStepId: step.id, currentStepName: step.name, sessionId, stepOutputs: outputs } });
          const context = previous ? `\n\nOutput from the previous workflow step:\n${previous}` : "";
          previous = await ask(`${step.prompt}\n\nWorkflow objective:\n${input.objective}${context}`, step.modelHint);
          outputs.push({ ...step, output: previous });
          job = await this.store.updateJob(tenantId,id, { state: { ...job.state, stage: `completed step ${index + 1} of ${input.steps!.length}`, currentStepId: "", currentStepName: "", sessionId, stepOutputs: outputs } });
        }
        final = previous;
      }
      const artifact = await this.store.createArtifact({ tenantId: job.tenantId, jobId: job.id, sessionId, name: "result.md", mediaType: "text/markdown", content: final });
      await this.store.addAudit({ tenantId: job.tenantId, actorId: job.actorId, action: "artifact.created", resourceType: "artifact", resourceId: artifact.id, metadata: { name: artifact.name, mediaType: artifact.mediaType, jobId: job.id } });
      await this.store.updateJob(tenantId,id, { status: "succeeded", result: { artifactId: artifact.id, output: final } });
      await this.store.addAudit({ tenantId: job.tenantId, actorId: job.actorId, action: "job.succeeded", resourceType: "job", resourceId: id, metadata: { type: job.type } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow failed";
      if (message !== "JOB_WAITING_APPROVAL" && message !== "JOB_CANCELLED") { const job = await this.store.job(tenantId,id); if (job) {await this.store.updateJob(tenantId,id, { status: "failed", error: message });await this.store.addAudit({tenantId,actorId:job.actorId,action:"job.failed",resourceType:"job",resourceId:id,metadata:{type:job.type,error:message}});} }
    } finally { this.active.delete(id); }
  }
}
