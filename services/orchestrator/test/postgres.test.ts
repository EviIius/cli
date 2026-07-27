import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PostgresStore } from "../src/postgres-store.js";

test("PostgresStore persists sessions, traces, usage, policy, and audit records", { skip: !process.env.DATABASE_URL }, async () => {
  const store=new PostgresStore(process.env.DATABASE_URL!); const tenantId=randomUUID(),sessionId=randomUUID(),traceId=randomUUID();
  try{
    await store.saveMessages(tenantId,sessionId,[{role:"user",content:"persist me"}]);
    await store.saveTrace({id:traceId,tenantId,sessionId,startedAt:new Date().toISOString(),status:"ok",spans:[]});
    await store.addUsage({id:randomUUID(),tenantId,sessionId,traceId,provider:"demo",model:"demo",inputTokens:2,outputTokens:3,costUsd:.01,createdAt:new Date().toISOString()});
    const policy=await store.tenantPolicy(tenantId); await store.saveTenantPolicy({...policy,monthlyBudgetUsd:42});
    await store.addAudit({tenantId,action:"test.persisted",resourceType:"session",resourceId:sessionId,traceId,metadata:{ok:true}});
    assert.equal((await store.session(tenantId,sessionId)).messages[0]?.content,"persist me");
    assert.equal((await store.listTraces(tenantId))[0]?.id,traceId);
    assert.equal((await store.usageSummary(tenantId)).costUsd,.01);
    assert.equal((await store.tenantPolicy(tenantId)).monthlyBudgetUsd,42);
    assert.equal((await store.listAudit(tenantId))[0]?.action,"test.persisted");
  }finally{await store.close();}
});
