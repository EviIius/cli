import { randomUUID } from "node:crypto";
import type { ApprovalRecord, ArtifactRecord, AuditEvent, ChatMessage, JobRecord, JobStatus, TenantPolicy, Trace, UsageRecord, UsageSummary } from "@relay/contracts";

export type Session = { id: string; tenantId: string; createdAt: string; updatedAt: string; messages: ChatMessage[] };

export interface RelayStore {
  getSession(tenantId: string, id: string): Promise<Session | undefined>;
  createSession(tenantId: string, id: string): Promise<Session>;
  session(tenantId: string, id: string): Promise<Session>;
  listSessions(tenantId: string, limit?: number): Promise<Session[]>;
  saveMessages(tenantId: string, id: string, messages: ChatMessage[]): Promise<Session>;
  saveTrace(trace: Trace): Promise<void>;
  trace(tenantId: string, id: string): Promise<Trace | undefined>;
  listTraces(tenantId: string, limit?: number): Promise<Trace[]>;
  addUsage(record: UsageRecord): Promise<void>;
  usageSummary(tenantId: string): Promise<UsageSummary>;
  reserveBudget(tenantId:string,reservationId:string,amountUsd:number,limitUsd:number):Promise<boolean>;
  settleBudget(tenantId:string,reservationId:string,actualUsd:number):Promise<void>;
  tenantPolicy(tenantId: string): Promise<TenantPolicy>;
  saveTenantPolicy(policy: TenantPolicy): Promise<void>;
  addAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent>;
  listAudit(tenantId: string, limit?: number): Promise<AuditEvent[]>;
  createApproval(input: Omit<ApprovalRecord, "id" | "status" | "requestedAt">): Promise<ApprovalRecord>;
  approval(tenantId: string, id: string): Promise<ApprovalRecord | undefined>;
  listApprovals(tenantId: string, status?: ApprovalRecord["status"]): Promise<ApprovalRecord[]>;
  resolveApproval(tenantId: string, id: string, status: "approved" | "rejected", actorId: string, reason?: string): Promise<ApprovalRecord>;
  claimApprovalExecution(tenantId:string,id:string):Promise<boolean>;
  completeApprovalExecution(tenantId:string,id:string,status:"succeeded"|"failed",result:unknown):Promise<ApprovalRecord>;
  claimApprovalResume(tenantId:string,traceId:string):Promise<boolean>;
  createJob(input: Omit<JobRecord,"id"|"status"|"state"|"createdAt"|"updatedAt"> & {id?:string}): Promise<JobRecord>;
  job(tenantId:string,id:string):Promise<JobRecord|undefined>;
  listJobs(tenantId:string,status?:JobStatus):Promise<JobRecord[]>;
  recoverableJobs():Promise<JobRecord[]>;
  claimJob(tenantId:string,id:string,workerId:string,leaseSeconds?:number):Promise<JobRecord|undefined>;
  updateJob(tenantId:string,id:string,patch:Partial<Pick<JobRecord,"status"|"state"|"result"|"error">>):Promise<JobRecord>;
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
  private readonly reservations=new Map<string,{tenantId:string;reserved:number;actual?:number}>();
  private readonly policies = new Map<string, TenantPolicy>();
  private readonly audit: AuditEvent[] = [];
  private readonly approvals = new Map<string,ApprovalRecord>();
  private readonly jobs=new Map<string,JobRecord>();
  private readonly artifacts:ArtifactRecord[]=[];
  async getSession(tenantId:string,id:string):Promise<Session|undefined>{const value=this.sessions.get(`${tenantId}:${id}`);return value?structuredClone(value):undefined;}
  async createSession(tenantId:string,id:string):Promise<Session>{for(const session of this.sessions.values())if(session.id===id&&session.tenantId!==tenantId)throw new Error("Session identifier is unavailable");const existing=await this.getSession(tenantId,id);if(existing)return existing;const value={id,tenantId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[]};this.sessions.set(`${tenantId}:${id}`,value);return structuredClone(value);}
  async session(tenantId: string, id: string): Promise<Session> {
    const key = `${tenantId}:${id}`;
    let value = this.sessions.get(key);
    if (!value) return await this.createSession(tenantId,id);
    return structuredClone(value);
  }
  async listSessions(tenantId: string, limit = 50): Promise<Session[]> { return [...this.sessions.values()].filter((session) => session.tenantId === tenantId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map((session) => structuredClone(session)); }
  async saveMessages(tenantId: string, id: string, messages: ChatMessage[]): Promise<Session> {
    const session = await this.session(tenantId, id); session.messages = structuredClone(messages); session.updatedAt = new Date().toISOString(); this.sessions.set(`${tenantId}:${id}`, session); return structuredClone(session);
  }
  async saveTrace(trace: Trace): Promise<void> { this.traces.set(trace.id, structuredClone(trace)); }
  async trace(tenantId:string,id: string): Promise<Trace | undefined> { const value = this.traces.get(id); return value?.tenantId===tenantId ? structuredClone(value) : undefined; }
  async listTraces(tenantId: string, limit = 100): Promise<Trace[]> { return [...this.traces.values()].filter((t) => t.tenantId === tenantId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit).map((t) => structuredClone(t)); }
  async addUsage(record: UsageRecord): Promise<void> { this.usage.push(structuredClone(record)); }
  async usageSummary(tenantId: string): Promise<UsageSummary> { return this.usage.filter((u) => u.tenantId === tenantId).reduce((sum, row) => ({ requests: sum.requests + 1, inputTokens: sum.inputTokens + row.inputTokens, outputTokens: sum.outputTokens + row.outputTokens, costUsd: sum.costUsd + row.costUsd }), { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }); }
  async reserveBudget(tenantId:string,reservationId:string,amountUsd:number,limitUsd:number):Promise<boolean>{const key=`${tenantId}:${reservationId}`;if(this.reservations.has(key))return true;const used=(await this.usageSummary(tenantId)).costUsd,reserved=[...this.reservations.values()].filter(item=>item.tenantId===tenantId&&item.actual===undefined).reduce((sum,item)=>sum+item.reserved,0);if(used+reserved+amountUsd>limitUsd)return false;this.reservations.set(key,{tenantId,reserved:amountUsd});return true;}
  async settleBudget(tenantId:string,reservationId:string,actualUsd:number):Promise<void>{const item=this.reservations.get(`${tenantId}:${reservationId}`);if(item)item.actual=actualUsd;}
  async tenantPolicy(tenantId: string): Promise<TenantPolicy> { return structuredClone(this.policies.get(tenantId) ?? defaultPolicy(tenantId)); }
  async saveTenantPolicy(policy: TenantPolicy): Promise<void> { this.policies.set(policy.tenantId, structuredClone(policy)); }
  async addAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> { const record = { ...event, id: randomUUID(), createdAt: new Date().toISOString() }; this.audit.push(record); return structuredClone(record); }
  async listAudit(tenantId: string, limit = 100): Promise<AuditEvent[]> { return this.audit.filter((event) => event.tenantId === tenantId).slice(-limit).reverse().map((event) => structuredClone(event)); }
  async createApproval(input:Omit<ApprovalRecord,"id"|"status"|"requestedAt">):Promise<ApprovalRecord>{const record:ApprovalRecord={...input,id:randomUUID(),status:"pending",executionStatus:"not_started",requestedAt:new Date().toISOString()};this.approvals.set(record.id,record);return structuredClone(record);}
  async approval(tenantId:string,id:string):Promise<ApprovalRecord|undefined>{const value=this.approvals.get(id);return value?.tenantId===tenantId?structuredClone(value):undefined;}
  async listApprovals(tenantId:string,status?:ApprovalRecord["status"]):Promise<ApprovalRecord[]>{return[...this.approvals.values()].filter(item=>item.tenantId===tenantId&&(!status||item.status===status)).sort((a,b)=>b.requestedAt.localeCompare(a.requestedAt)).map(item=>structuredClone(item));}
  async resolveApproval(tenantId:string,id:string,status:"approved"|"rejected",actorId:string,reason?:string):Promise<ApprovalRecord>{const record=this.approvals.get(id);if(!record||record.tenantId!==tenantId)throw new Error("Approval not found");if(record.status!=="pending"){if(record.status===status)return structuredClone(record);throw new Error("Approval is already resolved");}Object.assign(record,{status,resolvedBy:actorId,resolvedAt:new Date().toISOString(),reason});return structuredClone(record);}
  async claimApprovalExecution(tenantId:string,id:string):Promise<boolean>{const record=this.approvals.get(id);if(!record||record.tenantId!==tenantId||record.status!=="approved"||(record.executionStatus??"not_started")!=="not_started")return false;record.executionStatus="executing";return true;}
  async completeApprovalExecution(tenantId:string,id:string,status:"succeeded"|"failed",result:unknown):Promise<ApprovalRecord>{const record=this.approvals.get(id);if(!record||record.tenantId!==tenantId)throw new Error("Approval not found");record.executionStatus=status;record.result=structuredClone(result);return structuredClone(record);}
  async claimApprovalResume(tenantId:string,traceId:string):Promise<boolean>{const records=[...this.approvals.values()].filter(item=>item.tenantId===tenantId&&item.traceId===traceId);if(!records.length||records.some(item=>item.status==="pending"||item.resumedAt))return false;const now=new Date().toISOString();for(const record of records)record.resumedAt=now;return true;}
  async createJob(input:Omit<JobRecord,"id"|"status"|"state"|"createdAt"|"updatedAt">&{id?:string}):Promise<JobRecord>{const now=new Date().toISOString(),{id,...rest}=input;const record:JobRecord={...rest,id:id??randomUUID(),status:"queued",state:{},createdAt:now,updatedAt:now};this.jobs.set(record.id,record);return structuredClone(record);}
  async job(tenantId:string,id:string):Promise<JobRecord|undefined>{const value=this.jobs.get(id);return value?.tenantId===tenantId?structuredClone(value):undefined;}
  async listJobs(tenantId:string,status?:JobStatus):Promise<JobRecord[]>{return[...this.jobs.values()].filter(job=>job.tenantId===tenantId&&(!status||job.status===status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(job=>structuredClone(job));}
  async recoverableJobs():Promise<JobRecord[]>{return[...this.jobs.values()].filter(job=>job.status==="queued").map(job=>structuredClone(job));}
  async claimJob(tenantId:string,id:string,_workerId:string,_leaseSeconds=300):Promise<JobRecord|undefined>{const job=this.jobs.get(id);if(!job||job.tenantId!==tenantId||job.status!=="queued")return undefined;job.status="running";job.updatedAt=new Date().toISOString();return structuredClone(job);}
  async updateJob(tenantId:string,id:string,patch:Partial<Pick<JobRecord,"status"|"state"|"result"|"error">>):Promise<JobRecord>{const job=this.jobs.get(id);if(!job||job.tenantId!==tenantId)throw new Error("Job not found");Object.assign(job,structuredClone(patch),{updatedAt:new Date().toISOString()});return structuredClone(job);}
  async createArtifact(input:Omit<ArtifactRecord,"id"|"createdAt"|"sizeBytes">):Promise<ArtifactRecord>{const content=JSON.stringify(input.content);const record:ArtifactRecord={...input,id:randomUUID(),sizeBytes:Buffer.byteLength(content),createdAt:new Date().toISOString()};this.artifacts.push(record);return structuredClone(record);}
  async listArtifacts(tenantId:string,jobId?:string):Promise<ArtifactRecord[]>{return this.artifacts.filter(item=>item.tenantId===tenantId&&(!jobId||item.jobId===jobId)).map(item=>structuredClone(item));}
  async purgeBefore(tenantId:string,before:Date):Promise<Record<string,number>>{const cutoff=before.toISOString();let messages=0,traces=0,usage=0,artifacts=0;for(const [key,session]of this.sessions){if(session.tenantId===tenantId&&session.updatedAt<cutoff){messages+=session.messages.length;session.messages=[];this.sessions.set(key,session);}}for(const [id,trace]of this.traces){if(trace.tenantId===tenantId&&trace.startedAt<cutoff){this.traces.delete(id);traces+=1;}}for(let i=this.usage.length-1;i>=0;i--){if(this.usage[i]!.tenantId===tenantId&&this.usage[i]!.createdAt<cutoff){this.usage.splice(i,1);usage+=1;}}for(let i=this.artifacts.length-1;i>=0;i--){if(this.artifacts[i]!.tenantId===tenantId&&this.artifacts[i]!.createdAt<cutoff){this.artifacts.splice(i,1);artifacts+=1;}}return{messages,traces,usage,audit:0,artifacts};}
  async close(): Promise<void> {}
}

export { defaultPolicy };
