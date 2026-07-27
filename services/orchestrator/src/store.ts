import { randomUUID } from "node:crypto";
import type { ApprovalRecord, ArtifactRecord, AuditEvent, ChatMessage, JobRecord, JobStatus, TenantPolicy, Trace, UsageRecord, UsageSummary } from "@relay/contracts";

export type Session = { id: string; tenantId: string; createdAt: string; updatedAt: string; messages: ChatMessage[] };

export interface RelayStore {
  session(tenantId: string, id: string): Promise<Session>;
  listSessions(tenantId: string, limit?: number): Promise<Session[]>;
  saveMessages(tenantId: string, id: string, messages: ChatMessage[]): Promise<Session>;
  saveTrace(trace: Trace): Promise<void>;
  trace(id: string): Promise<Trace | undefined>;
  listTraces(tenantId: string, limit?: number): Promise<Trace[]>;
  addUsage(record: UsageRecord): Promise<void>;
  usageSummary(tenantId: string): Promise<UsageSummary>;
  tenantPolicy(tenantId: string): Promise<TenantPolicy>;
  saveTenantPolicy(policy: TenantPolicy): Promise<void>;
  addAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent>;
  listAudit(tenantId: string, limit?: number): Promise<AuditEvent[]>;
  createApproval(input: Omit<ApprovalRecord, "id" | "status" | "requestedAt">): Promise<ApprovalRecord>;
  approval(id: string): Promise<ApprovalRecord | undefined>;
  listApprovals(tenantId: string, status?: ApprovalRecord["status"]): Promise<ApprovalRecord[]>;
  resolveApproval(id: string, status: "approved" | "rejected", actorId: string, reason?: string): Promise<ApprovalRecord>;
  createJob(input: Omit<JobRecord,"id"|"status"|"state"|"createdAt"|"updatedAt">): Promise<JobRecord>;
  job(id:string):Promise<JobRecord|undefined>;
  listJobs(tenantId:string,status?:JobStatus):Promise<JobRecord[]>;
  recoverableJobs():Promise<JobRecord[]>;
  claimJob(id:string,workerId:string,leaseSeconds?:number):Promise<JobRecord|undefined>;
  updateJob(id:string,patch:Partial<Pick<JobRecord,"status"|"state"|"result"|"error">>):Promise<JobRecord>;
  createArtifact(input:Omit<ArtifactRecord,"id"|"createdAt"|"sizeBytes">):Promise<ArtifactRecord>;
  listArtifacts(tenantId:string,jobId?:string):Promise<ArtifactRecord[]>;
  purgeBefore(tenantId:string,before:Date):Promise<Record<string,number>>;
  close(): Promise<void>;
}

const defaultPolicy = (tenantId: string): TenantPolicy => ({
  tenantId,
  allowedProviders: ["openai", "anthropic", "mistral", "qwen", "gemini", "gemma", "meta", "local", "demo"],
  externalProvidersAllowed: true,
  monthlyBudgetUsd: 100,
  writeToolsRequireApproval: true
});

export class MemoryStore implements RelayStore {
  private readonly sessions = new Map<string, Session>();
  private readonly traces = new Map<string, Trace>();
  private readonly usage: UsageRecord[] = [];
  private readonly policies = new Map<string, TenantPolicy>();
  private readonly audit: AuditEvent[] = [];
  private readonly approvals = new Map<string,ApprovalRecord>();
  private readonly jobs=new Map<string,JobRecord>();
  private readonly artifacts:ArtifactRecord[]=[];
  async session(tenantId: string, id: string): Promise<Session> {
    const key = `${tenantId}:${id}`;
    let value = this.sessions.get(key);
    if (!value) { value = { id, tenantId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] }; this.sessions.set(key, value); }
    return structuredClone(value);
  }
  async listSessions(tenantId: string, limit = 50): Promise<Session[]> { return [...this.sessions.values()].filter((session) => session.tenantId === tenantId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map((session) => structuredClone(session)); }
  async saveMessages(tenantId: string, id: string, messages: ChatMessage[]): Promise<Session> {
    const session = await this.session(tenantId, id); session.messages = structuredClone(messages); session.updatedAt = new Date().toISOString(); this.sessions.set(`${tenantId}:${id}`, session); return structuredClone(session);
  }
  async saveTrace(trace: Trace): Promise<void> { this.traces.set(trace.id, structuredClone(trace)); }
  async trace(id: string): Promise<Trace | undefined> { const value = this.traces.get(id); return value ? structuredClone(value) : undefined; }
  async listTraces(tenantId: string, limit = 100): Promise<Trace[]> { return [...this.traces.values()].filter((t) => t.tenantId === tenantId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit).map((t) => structuredClone(t)); }
  async addUsage(record: UsageRecord): Promise<void> { this.usage.push(structuredClone(record)); }
  async usageSummary(tenantId: string): Promise<UsageSummary> { return this.usage.filter((u) => u.tenantId === tenantId).reduce((sum, row) => ({ requests: sum.requests + 1, inputTokens: sum.inputTokens + row.inputTokens, outputTokens: sum.outputTokens + row.outputTokens, costUsd: sum.costUsd + row.costUsd }), { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }); }
  async tenantPolicy(tenantId: string): Promise<TenantPolicy> { return structuredClone(this.policies.get(tenantId) ?? defaultPolicy(tenantId)); }
  async saveTenantPolicy(policy: TenantPolicy): Promise<void> { this.policies.set(policy.tenantId, structuredClone(policy)); }
  async addAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> { const record = { ...event, id: randomUUID(), createdAt: new Date().toISOString() }; this.audit.push(record); return structuredClone(record); }
  async listAudit(tenantId: string, limit = 100): Promise<AuditEvent[]> { return this.audit.filter((event) => event.tenantId === tenantId).slice(-limit).reverse().map((event) => structuredClone(event)); }
  async createApproval(input:Omit<ApprovalRecord,"id"|"status"|"requestedAt">):Promise<ApprovalRecord>{const record:ApprovalRecord={...input,id:randomUUID(),status:"pending",requestedAt:new Date().toISOString()};this.approvals.set(record.id,record);return structuredClone(record);}
  async approval(id:string):Promise<ApprovalRecord|undefined>{const value=this.approvals.get(id);return value?structuredClone(value):undefined;}
  async listApprovals(tenantId:string,status?:ApprovalRecord["status"]):Promise<ApprovalRecord[]>{return[...this.approvals.values()].filter(item=>item.tenantId===tenantId&&(!status||item.status===status)).sort((a,b)=>b.requestedAt.localeCompare(a.requestedAt)).map(item=>structuredClone(item));}
  async resolveApproval(id:string,status:"approved"|"rejected",actorId:string,reason?:string):Promise<ApprovalRecord>{const record=this.approvals.get(id);if(!record)throw new Error("Approval not found");if(record.status!=="pending")throw new Error("Approval is already resolved");Object.assign(record,{status,resolvedBy:actorId,resolvedAt:new Date().toISOString(),reason});return structuredClone(record);}
  async createJob(input:Omit<JobRecord,"id"|"status"|"state"|"createdAt"|"updatedAt">):Promise<JobRecord>{const now=new Date().toISOString();const record:JobRecord={...input,id:randomUUID(),status:"queued",state:{},createdAt:now,updatedAt:now};this.jobs.set(record.id,record);return structuredClone(record);}
  async job(id:string):Promise<JobRecord|undefined>{const value=this.jobs.get(id);return value?structuredClone(value):undefined;}
  async listJobs(tenantId:string,status?:JobStatus):Promise<JobRecord[]>{return[...this.jobs.values()].filter(job=>job.tenantId===tenantId&&(!status||job.status===status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(job=>structuredClone(job));}
  async recoverableJobs():Promise<JobRecord[]>{return[...this.jobs.values()].filter(job=>job.status==="queued").map(job=>structuredClone(job));}
  async claimJob(id:string,_workerId:string,_leaseSeconds=300):Promise<JobRecord|undefined>{const job=this.jobs.get(id);if(!job||job.status!=="queued")return undefined;job.status="running";job.updatedAt=new Date().toISOString();return structuredClone(job);}
  async updateJob(id:string,patch:Partial<Pick<JobRecord,"status"|"state"|"result"|"error">>):Promise<JobRecord>{const job=this.jobs.get(id);if(!job)throw new Error("Job not found");Object.assign(job,structuredClone(patch),{updatedAt:new Date().toISOString()});return structuredClone(job);}
  async createArtifact(input:Omit<ArtifactRecord,"id"|"createdAt"|"sizeBytes">):Promise<ArtifactRecord>{const content=JSON.stringify(input.content);const record:ArtifactRecord={...input,id:randomUUID(),sizeBytes:Buffer.byteLength(content),createdAt:new Date().toISOString()};this.artifacts.push(record);return structuredClone(record);}
  async listArtifacts(tenantId:string,jobId?:string):Promise<ArtifactRecord[]>{return this.artifacts.filter(item=>item.tenantId===tenantId&&(!jobId||item.jobId===jobId)).map(item=>structuredClone(item));}
  async purgeBefore(tenantId:string,before:Date):Promise<Record<string,number>>{const cutoff=before.toISOString();let messages=0,traces=0,usage=0,audit=0,artifacts=0;for(const [key,session]of this.sessions){if(session.tenantId===tenantId&&session.updatedAt<cutoff){messages+=session.messages.length;session.messages=[];this.sessions.set(key,session);}}for(const [id,trace]of this.traces){if(trace.tenantId===tenantId&&trace.startedAt<cutoff){this.traces.delete(id);traces+=1;}}for(let i=this.usage.length-1;i>=0;i--){if(this.usage[i]!.tenantId===tenantId&&this.usage[i]!.createdAt<cutoff){this.usage.splice(i,1);usage+=1;}}for(let i=this.audit.length-1;i>=0;i--){if(this.audit[i]!.tenantId===tenantId&&this.audit[i]!.createdAt<cutoff){this.audit.splice(i,1);audit+=1;}}for(let i=this.artifacts.length-1;i>=0;i--){if(this.artifacts[i]!.tenantId===tenantId&&this.artifacts[i]!.createdAt<cutoff){this.artifacts.splice(i,1);artifacts+=1;}}return{messages,traces,usage,audit,artifacts};}
  async close(): Promise<void> {}
}

export { defaultPolicy };
