import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { adaptersFromEnvironment } from "@relay/adapters";
import { chatRequestSchema, type AgentDefinition, type AuthPrincipal, type TenantPolicy, type TenantRole } from "@relay/contracts";
import { Orchestrator, PromptRegistry, storeFromEnvironment } from "@relay/orchestrator";
import { createDefaultToolRunner } from "@relay/tool-runner";
import { runEvalDataset, WorkflowEngine } from "@relay/workers";
import { AuthService } from "./auth.js";

export function createApp(env: NodeJS.ProcessEnv = process.env) {
  const app = Fastify({ logger: { level: env.LOG_LEVEL ?? "info" } });
  const auth = new AuthService(env);
  const store = storeFromEnvironment(env);
  const adapters = adaptersFromEnvironment(env);
  const promptRoot=env.PROMPTS_DIR??fileURLToPath(new URL("../../../packages/prompts/",import.meta.url));
  const agentsFile=env.AGENTS_FILE??fileURLToPath(new URL("../../../config/agents.json",import.meta.url));
  const evalDataset=env.EVAL_DATASET??fileURLToPath(new URL("../../../evals/datasets/smoke.jsonl",import.meta.url));
  const webRoot=env.WEB_DIST_DIR??fileURLToPath(new URL("../../../apps/web/dist",import.meta.url));
  const prompts=new PromptRegistry(promptRoot);
  const orchestrator = new Orchestrator(adapters, createDefaultToolRunner(), store,undefined,prompts);
  const workflows=new WorkflowEngine(orchestrator,store);
  app.register(cors, { origin: true });
  if(env.SERVE_WEB==="true") app.register(staticFiles,{root:webRoot,wildcard:false});
  app.register(rateLimit,{global:false,max:Number(env.RATE_LIMIT_MAX??120),timeWindow:env.RATE_LIMIT_WINDOW??"1 minute",keyGenerator:(request)=>auth.verify(request.headers.authorization)?.tenantId??request.ip});
  let checkRateLimit: ReturnType<typeof app.createRateLimit> | undefined;
  app.addHook("onRequest",async(request,reply)=>{
    checkRateLimit??=app.createRateLimit();
    const limit=await checkRateLimit(request);
    if(!limit.isAllowed&&limit.isExceeded){
      reply.header("retry-after",limit.ttlInSeconds).code(429).send({error:"Rate limit exceeded"});
    }
  });
  app.addHook("onClose", async () => { await Promise.all([store.close(), auth.close()]); });
  app.addHook("onReady", async () => { await auth.ready(); await workflows.recoverAll(); });

  function principal(request: FastifyRequest): AuthPrincipal | undefined { return auth.verify(request.headers.authorization) ?? (auth.mode === "optional" ? auth.developmentPrincipal() : undefined); }
  function guard(request: FastifyRequest, reply: FastifyReply, roles?: TenantRole[]): AuthPrincipal | undefined {
    const actor = principal(request); if (!actor) { reply.code(401).send({ error: "Authentication required" }); return undefined; }
    if (roles && !auth.authorize(actor, roles)) { reply.code(403).send({ error: "Insufficient role" }); return undefined; }
    return actor;
  }

  app.get("/health", async () => ({ status: "ok", service: "relay-api", timestamp: new Date().toISOString() }));
  app.get("/ready", async () => ({ status: "ready", persistence: env.DATABASE_URL ? "postgres" : "memory", auth: auth.mode, adapters: adapters.map((adapter) => ({ id: adapter.id, provider: adapter.provider, model: adapter.model, active: adapter.supports({} as never) })) }));

  app.post("/v1/auth/bootstrap", async (request, reply) => { try { const body=request.body as Record<string,unknown>; if (![body.email,body.password,body.name,body.tenantName].every((v)=>typeof v==="string"&&v.length>0)) return reply.code(400).send({error:"email, password, name, and tenantName are required"}); return await auth.bootstrap(body as {email:string;password:string;name:string;tenantName:string}); } catch(error) { return reply.code(409).send({error:error instanceof Error?error.message:"Bootstrap failed"}); } });
  app.post("/v1/auth/login", async (request, reply) => { const body=request.body as Record<string,unknown>; if (typeof body.email!=="string"||typeof body.password!=="string") return reply.code(400).send({error:"email and password are required"}); const result=await auth.login(body.email,body.password); return result ?? reply.code(401).send({error:"Invalid credentials"}); });
  app.get("/v1/auth/me", async (request, reply) => { const actor=guard(request,reply); return actor; });

  app.post("/v1/chat", async (request, reply) => {
    const actor=guard(request,reply,["owner","admin","builder"]); if(!actor) return;
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid chat request", details: parsed.error.flatten() });
    try { return await orchestrator.run({ ...parsed.data, tenantId: actor.tenantId, metadata: { ...parsed.data.metadata, actorId: actor.userId } }); }
    catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "Chat request failed" }); }
  });

  app.post("/v1/chat/stream", async (request, reply) => {
    const actor=guard(request,reply,["owner","admin","builder"]); if(!actor) return;
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid chat request", details: parsed.error.flatten() });
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      send("start", { sessionId: parsed.data.sessionId });
      const { result, trace } = await orchestrator.run({ ...parsed.data, tenantId: actor.tenantId, metadata: { ...parsed.data.metadata, actorId: actor.userId } }, { onDelta: (text) => send("delta", { text }) });
      send("route", { provider: result.provider, model: result.model, reason: result.routeReason, traceId: result.traceId });
      send("complete", { result, trace });
    } catch (error) { send("error", { error: error instanceof Error ? error.message : "Chat request failed" }); }
    finally { reply.raw.end(); }
  });

  app.get<{ Params: { tenantId: string; sessionId: string } }>("/v1/tenants/:tenantId/sessions/:sessionId", async (request,reply) => { const actor=guard(request,reply); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); return await orchestrator.store.session(actor.tenantId,request.params.sessionId); });
  app.get<{ Params: { tenantId: string } }>("/v1/tenants/:tenantId/sessions", async (request,reply) => { const actor=guard(request,reply); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); return await orchestrator.store.listSessions(actor.tenantId); });
  app.get<{ Params: { tenantId: string } }>("/v1/tenants/:tenantId/traces", async (request,reply) => { const actor=guard(request,reply); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); return await orchestrator.store.listTraces(actor.tenantId); });
  app.get<{ Params: { tenantId: string } }>("/v1/tenants/:tenantId/usage", async (request,reply) => { const actor=guard(request,reply); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); return await orchestrator.store.usageSummary(actor.tenantId); });
  app.get<{ Params: { tenantId: string } }>("/v1/tenants/:tenantId/audit", async (request,reply) => { const actor=guard(request,reply,["owner","admin"]); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); return await orchestrator.store.listAudit(actor.tenantId); });
  app.get<{ Params: { tenantId: string } }>("/v1/tenants/:tenantId/policy", async (request,reply) => { const actor=guard(request,reply); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); return await orchestrator.store.tenantPolicy(actor.tenantId); });
  app.put<{ Params: { tenantId: string } }>("/v1/tenants/:tenantId/policy", async (request,reply) => { const actor=guard(request,reply,["owner","admin"]); if(!actor)return; if(request.params.tenantId!==actor.tenantId)return reply.code(403).send({error:"Cross-tenant access denied"}); const policy={...(request.body as TenantPolicy),tenantId:actor.tenantId}; await orchestrator.store.saveTenantPolicy(policy); await orchestrator.store.addAudit({tenantId:actor.tenantId,actorId:actor.userId,action:"policy.updated",resourceType:"tenant",resourceId:actor.tenantId,metadata:{}}); return policy; });
  app.get("/v1/tools", async (request,reply) => { const actor=guard(request,reply); return actor ? orchestrator.tools.specs() : undefined; });
  app.get("/v1/providers/status", async (request,reply) => {
    const actor=guard(request,reply,["owner","admin"]); if(!actor)return;
    const known=[{id:"openai",configured:Boolean(env.OPENAI_API_KEY)},{id:"anthropic",configured:Boolean(env.ANTHROPIC_API_KEY)},{id:"mistral",configured:Boolean(env.MISTRAL_API_KEY)},{id:"qwen",configured:Boolean(env.QWEN_API_KEY)}];
    const active=await Promise.all(adapters.map(async adapter=>({id:adapter.id,provider:adapter.provider,model:adapter.model,configured:true,capabilities:adapter.capabilities,health:adapter.health?await adapter.health():{ok:true,latencyMs:0}})));
    return {providers:[...known.filter(item=>!active.some(adapter=>adapter.provider===item.id)),...active]};
  });
  app.get("/v1/approvals",async(request,reply)=>{const actor=guard(request,reply);if(!actor)return;const status=(request.query as {status?:"pending"|"approved"|"rejected"}).status;return await store.listApprovals(actor.tenantId,status);});
  app.post<{Params:{id:string}}>("/v1/approvals/:id/resolve",async(request,reply)=>{const actor=guard(request,reply,["owner","admin"]);if(!actor)return;const body=request.body as {status?:"approved"|"rejected";reason?:string};if(body.status!=="approved"&&body.status!=="rejected")return reply.code(400).send({error:"status must be approved or rejected"});try{const result=await orchestrator.resolveApproval(request.params.id,actor.tenantId,actor.userId,body.status,body.reason);await workflows.resumeForApproval(actor.tenantId,request.params.id);return result;}catch(error){return reply.code(409).send({error:error instanceof Error?error.message:"Approval resolution failed"});}});
  app.post("/v1/jobs",async(request,reply)=>{const actor=guard(request,reply,["owner","admin","builder"]);if(!actor)return;const body=request.body as {type?:"single"|"planner-reviewer";objective?:string;priority?:"fast"|"balanced"|"deep"|"private"};if(!body.objective||!body.type)return reply.code(400).send({error:"type and objective are required"});try{return reply.code(202).send(await workflows.submit(actor.tenantId,actor.userId,body.type,{objective:body.objective,priority:body.priority}));}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Job submission failed"});}});
  app.get("/v1/jobs",async(request,reply)=>{const actor=guard(request,reply);if(!actor)return;return await store.listJobs(actor.tenantId,(request.query as {status?:import("@relay/contracts").JobStatus}).status);});
  app.get<{Params:{id:string}}>("/v1/jobs/:id",async(request,reply)=>{const actor=guard(request,reply);if(!actor)return;const job=await store.job(request.params.id);return job?.tenantId===actor.tenantId?job:reply.code(404).send({error:"Job not found"});});
  app.post<{Params:{id:string}}>("/v1/jobs/:id/cancel",async(request,reply)=>{const actor=guard(request,reply,["owner","admin","builder"]);if(!actor)return;try{return await workflows.cancel(request.params.id,actor.tenantId);}catch(error){return reply.code(404).send({error:error instanceof Error?error.message:"Job not found"});}});
  app.get("/v1/artifacts",async(request,reply)=>{const actor=guard(request,reply);if(!actor)return;return await store.listArtifacts(actor.tenantId,(request.query as {jobId?:string}).jobId);});
  app.post("/v1/artifacts",async(request,reply)=>{const actor=guard(request,reply,["owner","admin","builder"]);if(!actor)return;const body=request.body as {sessionId?:string;name?:string;mediaType?:string;content?:unknown};if(!body.sessionId||!body.name||!body.mediaType||body.content===undefined)return reply.code(400).send({error:"sessionId, name, mediaType, and content are required"});if(Buffer.byteLength(JSON.stringify(body.content))>750_000)return reply.code(413).send({error:"Artifact exceeds the 750 KB inline limit"});await store.session(actor.tenantId,body.sessionId);const artifact=await store.createArtifact({tenantId:actor.tenantId,sessionId:body.sessionId,name:body.name,mediaType:body.mediaType,content:body.content});await store.addAudit({tenantId:actor.tenantId,actorId:actor.userId,action:"artifact.created",resourceType:"artifact",resourceId:artifact.id,metadata:{name:artifact.name,mediaType:artifact.mediaType}});return reply.code(201).send(artifact);});
  app.get("/v1/agents",async(request,reply)=>{const actor=guard(request,reply);if(!actor)return;try{return JSON.parse(await readFile(agentsFile,"utf8")) as AgentDefinition[];}catch(error){return reply.code(500).send({error:error instanceof Error?error.message:"Agent registry unavailable"});}});
  app.post<{Params:{id:string}}>("/v1/traces/:id/replay",async(request,reply)=>{const actor=guard(request,reply,["owner","admin","builder"]);if(!actor)return;const trace=await store.trace(request.params.id);if(!trace||trace.tenantId!==actor.tenantId)return reply.code(404).send({error:"Trace not found"});const session=await store.session(actor.tenantId,trace.sessionId),lastUser=[...session.messages].reverse().find(message=>message.role==="user");if(!lastUser)return reply.code(409).send({error:"Trace session has no user turn to replay"});const replaySessionId=randomUUID();const result=await orchestrator.run({tenantId:actor.tenantId,sessionId:replaySessionId,priority:"balanced",messages:[lastUser],metadata:{actorId:actor.userId,replayOf:trace.id}});await store.addAudit({tenantId:actor.tenantId,actorId:actor.userId,action:"trace.replayed",resourceType:"trace",resourceId:trace.id,traceId:result.trace.id,metadata:{replaySessionId}});return result;});
  app.get("/v1/evals",async(request,reply)=>{const actor=guard(request,reply);if(!actor)return;const artifacts=await store.listArtifacts(actor.tenantId);return artifacts.filter(item=>item.mediaType==="application/vnd.relay.eval+json").map(item=>item.content);});
  app.post("/v1/evals/run",async(request,reply)=>{const actor=guard(request,reply,["owner","admin"]);if(!actor)return;const evalOrchestrator=new Orchestrator(adaptersFromEnvironment({...env,OPENAI_API_KEY:"",ANTHROPIC_API_KEY:"",MISTRAL_API_KEY:"",QWEN_API_KEY:"",LOCAL_BASE_URL:"disabled"}),createDefaultToolRunner());const report=await runEvalDataset(evalOrchestrator,resolve(evalDataset));await store.createArtifact({tenantId:actor.tenantId,name:`eval-${report.id}.json`,mediaType:"application/vnd.relay.eval+json",content:report});await store.addAudit({tenantId:actor.tenantId,actorId:actor.userId,action:"eval.completed",resourceType:"eval",resourceId:report.id,metadata:{passRate:report.passRate,passed:report.passed,failed:report.failed}});return report;});
  app.get("/v1/prompts",async(request,reply)=>{const actor=guard(request,reply);return actor?await prompts.list():undefined;});
  app.post("/v1/prompts/promote",async(request,reply)=>{const actor=guard(request,reply,["owner","admin"]);if(!actor)return;const body=request.body as {name?:string;version?:string;channel?:string};if(!body.name||!body.version)return reply.code(400).send({error:"name and version are required"});try{await prompts.promote(body.name,body.version,body.channel);await store.addAudit({tenantId:actor.tenantId,actorId:actor.userId,action:"prompt.promoted",resourceType:"prompt",resourceId:`${body.name}@${body.version}`,metadata:{channel:body.channel??"production"}});return{ok:true};}catch(error){return reply.code(404).send({error:error instanceof Error?error.message:"Prompt not found"});}});
  app.post("/v1/retention/purge",async(request,reply)=>{const actor=guard(request,reply,["owner"]);if(!actor)return;const days=Number((request.body as {olderThanDays?:number}).olderThanDays);if(!Number.isFinite(days)||days<1)return reply.code(400).send({error:"olderThanDays must be at least 1"});const before=new Date(Date.now()-days*86400000);const deleted=await store.purgeBefore(actor.tenantId,before);await store.addAudit({tenantId:actor.tenantId,actorId:actor.userId,action:"retention.purged",resourceType:"tenant",resourceId:actor.tenantId,metadata:{before:before.toISOString(),deleted}});return{before:before.toISOString(),deleted};});
  if(env.SERVE_WEB==="true") app.get("/*",async(_request,reply)=>reply.sendFile("index.html"));
  return app;
}
