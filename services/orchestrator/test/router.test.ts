import assert from "node:assert/strict";
import test from "node:test";
import type { ChatRequest, ModelAdapter } from "@relay/contracts";
import { PolicyRouter } from "../src/router/index.js";

const request: ChatRequest = { tenantId: "t", sessionId: "s", priority: "balanced", messages: [{ role: "user", content: "hello" }] };
const adapter = (id: string, provider: "openai" | "demo", selfHosted = false): ModelAdapter => ({ id, provider, model: id, capabilities: { tools: true, structuredOutput: true, streaming: true, selfHosted }, estimatedInputCostPerMillion: 0, estimatedOutputCostPerMillion:0, supports: () => true, invoke: async () => ({ provider, model: id, traceId: "x" }) });

test("skips providers excluded by tenant policy", () => {
  const router = new PolicyRouter([adapter("openai:balanced", "openai"), adapter("demo:relay", "demo", true)]);
  const result = router.route(request, { tenantId: "t", allowedProviders: ["demo"], externalProvidersAllowed: false, monthlyBudgetUsd: 1, writeToolsRequireApproval: true });
  assert.equal(result.adapter.id, "demo:relay");
  assert.ok(result.considered.some((reason) => reason.includes("provider blocked")));
});

test("private lane requires a self-hosted adapter", () => {
  const router = new PolicyRouter([adapter("demo:relay", "demo", true)]);
  const result = router.route({ ...request, priority: "private" }, { tenantId: "t", allowedProviders: ["demo"], externalProvidersAllowed: false, monthlyBudgetUsd: 1, writeToolsRequireApproval: true });
  assert.equal(result.adapter.capabilities.selfHosted, true);
});
