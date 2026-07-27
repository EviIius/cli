import { randomUUID } from "node:crypto";
import type { JobRecord } from "@relay/contracts";
import type { Orchestrator, RelayStore } from "@relay/orchestrator";
export * from "./eval.js";

export type WorkflowInput = { objective: string; sessionId?: string; priority?: "fast" | "balanced" | "deep" | "private" };

export class WorkflowEngine {
  private readonly active = new Set<string>();
  private readonly workerId = randomUUID();
  constructor(private readonly orchestrator: Orchestrator, private readonly store: RelayStore) {}

  async submit(tenantId: string, actorId: string, type: JobRecord["type"], input: WorkflowInput): Promise<JobRecord> {
    if (!input.objective?.trim()) throw new Error("objective is required");
    const job = await this.store.createJob({ tenantId, actorId, type, input: input as unknown as Record<string, unknown> });
    setTimeout(() => void this.execute(job.id), 0);
    return job;
  }
  async recover(tenantId: string): Promise<void> { const jobs = [...await this.store.listJobs(tenantId, "queued"), ...await this.store.listJobs(tenantId, "running")]; await Promise.all(jobs.map((job) => this.execute(job.id))); }
  async recoverAll(): Promise<void> { const jobs = await this.store.recoverableJobs(); await Promise.all(jobs.map((job) => this.execute(job.id))); }
  async cancel(id: string, tenantId: string): Promise<JobRecord> { const job = await this.store.job(id); if (!job || job.tenantId !== tenantId) throw new Error("Job not found"); if (["succeeded", "failed", "cancelled"].includes(job.status)) return job; return await this.store.updateJob(id, { status: "cancelled" }); }
  async resumeForApproval(tenantId: string, approvalId: string): Promise<void> { const waiting = await this.store.listJobs(tenantId, "waiting_approval"); const matches = waiting.filter((job) => Array.isArray(job.state.approvalIds) && (job.state.approvalIds as unknown[]).includes(approvalId)); await Promise.all(matches.map(async (job) => { await this.store.updateJob(job.id, { status: "queued", state: { ...job.state, approvalIds: [] } }); await this.execute(job.id); })); }

  async execute(id: string): Promise<void> {
    if (this.active.has(id)) return;
    this.active.add(id);
    try {
      let job = await this.store.claimJob(id, this.workerId);
      if (!job || job.status === "cancelled") return;
      const input = job.input as unknown as WorkflowInput, sessionId = String(job.state.sessionId ?? input.sessionId ?? randomUUID());
      const ask = async (content: string) => {
        const current = await this.store.job(id); if (current?.status === "cancelled") throw new Error("JOB_CANCELLED");
        const response = await this.orchestrator.run({ tenantId: job!.tenantId, sessionId, priority: input.priority ?? "deep", messages: [{ role: "user", content }], metadata: { actorId: job!.actorId ?? "" } });
        if (response.result.pendingApprovals?.length) { await this.store.updateJob(id, { status: "waiting_approval", state: { ...job!.state, sessionId, approvalIds: response.result.pendingApprovals.map((item) => item.id) } }); throw new Error("JOB_WAITING_APPROVAL"); }
        return response.result.outputText ?? "";
      };
      let final: string;
      if (job.type === "single") final = await ask(input.objective);
      else {
        const plan = typeof job.state.plan === "string" ? job.state.plan : await ask(`Act as a planner. Produce a concrete, ordered plan for this objective:\n${input.objective}`);
        job = await this.store.updateJob(id, { state: { ...job.state, stage: "planned", sessionId, plan } });
        const draft = typeof job.state.draft === "string" ? job.state.draft : await ask(`Act as the executor. Complete the objective using this plan.\nObjective: ${input.objective}\nPlan:\n${plan}`);
        job = await this.store.updateJob(id, { state: { ...job.state, stage: "executed", draft } });
        final = await ask(`Act as a strict reviewer. Return an improved final answer that corrects omissions or errors.\nObjective: ${input.objective}\nDraft:\n${draft}`);
        job = await this.store.updateJob(id, { state: { ...job.state, stage: "reviewed", review: final } });
      }
      const artifact = await this.store.createArtifact({ tenantId: job.tenantId, jobId: job.id, sessionId, name: "result.md", mediaType: "text/markdown", content: final });
      await this.store.updateJob(id, { status: "succeeded", result: { artifactId: artifact.id, output: final } });
      await this.store.addAudit({ tenantId: job.tenantId, actorId: job.actorId, action: "job.succeeded", resourceType: "job", resourceId: id, metadata: { type: job.type } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow failed";
      if (message !== "JOB_WAITING_APPROVAL" && message !== "JOB_CANCELLED") { const job = await this.store.job(id); if (job) await this.store.updateJob(id, { status: "failed", error: message }); }
    } finally { this.active.delete(id); }
  }
}
