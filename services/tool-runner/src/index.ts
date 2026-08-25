export * from "./runtime/execute.js";
import { ToolRunner } from "./runtime/execute.js";

export function createDefaultToolRunner(): ToolRunner {
  const runner = new ToolRunner();
  runner.register({
    name: "get_incident_status",
    description: "Look up an incident by identifier",
    mode: "read",
    inputSchema: { type: "object", properties: { id: { type: "string", pattern: "^[A-Za-z]+-[0-9]+$" } }, required: ["id"], additionalProperties: false }
  }, async (input: unknown) => {
    const { id } = input as { id: string };
    const states = ["monitoring", "identified", "resolved"];
    const state = states[id.length % states.length];
    return { id: id.toUpperCase(), status: state, customerVisible: state !== "resolved", updatedAt: new Date().toISOString() };
  });
  return runner;
}
