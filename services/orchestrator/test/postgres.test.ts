import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PostgresStore } from "../src/postgres-store.js";

test("PostgresStore persists tenant-scoped records and rejects cross-tenant session access", { skip: !process.env.DATABASE_URL }, async () => {
  const store=new PostgresStore(process.env.DATABASE_URL!); const tenantId=randomUUID(),otherTenantId=randomUUID(),sessionId=randomUUID(),traceId=randomUUID();
  try{
    await store.pool.query(`INSERT INTO tenants(id,slug,name,policy) VALUES($1::uuid,$2,'Test tenant','{}'::jsonb),($3::uuid,$4,'Other tenant','{}'::jsonb)`,[tenantId,`test-${tenantId}`,otherTenantId,`test-${otherTenantId}`]);
    await store.saveMessages(tenantId,sessionId,[{role:"user",content:"persist me"}]);
    await store.saveTrace({id:traceId,tenantId,sessionId,startedAt:new Date().toISOString(),status:"ok",spans:[]});
    await store.addUsage({id:randomUUID(),tenantId,sessionId,traceId,provider:"demo",model:"demo",inputTokens:2,outputTokens:3,costUsd:.01,createdAt:new Date().toISOString()});
    const policy=await store.tenantPolicy(tenantId); await store.saveTenantPolicy({...policy,monthlyBudgetUsd:42});
    await store.addAudit({tenantId,action:"test.persisted",resourceType:"session",resourceId:sessionId,traceId,metadata:{ok:true}});
    assert.equal((await store.getSession(tenantId,sessionId))?.messages[0]?.content,"persist me");
    assert.equal(await store.getSession(otherTenantId,sessionId),undefined);
    await assert.rejects(()=>store.createSession(otherTenantId,sessionId),/unavailable/);
    await assert.rejects(()=>store.saveMessages(otherTenantId,sessionId,[{role:"user",content:"replace"}]),/unavailable/);
    assert.equal((await store.getSession(tenantId,sessionId))?.messages[0]?.content,"persist me");
    assert.equal((await store.listTraces(tenantId))[0]?.id,traceId);
    assert.equal((await store.usageSummary(tenantId)).costUsd,.01);
    assert.equal((await store.tenantPolicy(tenantId)).monthlyBudgetUsd,42);
    assert.equal((await store.listAudit(tenantId))[0]?.action,"test.persisted");
  }finally{for(const table of ["usage_records","audit_events","traces"])await store.pool.query(`DELETE FROM ${table} WHERE tenant_id IN ($1::uuid,$2::uuid)`,[tenantId,otherTenantId]);await store.pool.query(`DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE tenant_id IN ($1::uuid,$2::uuid))`,[tenantId,otherTenantId]);await store.pool.query(`DELETE FROM sessions WHERE tenant_id IN ($1::uuid,$2::uuid)`,[tenantId,otherTenantId]);await store.pool.query(`DELETE FROM tenants WHERE id IN ($1::uuid,$2::uuid)`,[tenantId,otherTenantId]);await store.close();}
});
