import assert from "node:assert/strict";
import test from "node:test";
import { ToolRunner } from "../src/index.js";

const policy = { tenantId: "tenant", allowedProviders: ["demo"], externalProvidersAllowed: false, monthlyBudgetUsd: 10, writeToolsRequireApproval: true };
const context = { tenantId: "tenant", sessionId: "session", traceId: "trace", approved: false };

test("validates tool input before execution", async () => {
  const runner = new ToolRunner();
  runner.register({ name: "lookup", description: "Lookup", mode: "read", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, async () => "ok");
  const result = await runner.execute("lookup", {}, context, policy);
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /required property/);
});

test("write tools fail closed until approved", async () => {
  const runner = new ToolRunner();
  runner.register({ name: "update", description: "Update", mode: "write", inputSchema: { type: "object" } }, async () => "ok");
  assert.equal((await runner.execute("update", {}, context, policy)).status, "approval_required");
  assert.equal((await runner.execute("update", {}, { ...context, approved: true }, policy)).status, "succeeded");
});
