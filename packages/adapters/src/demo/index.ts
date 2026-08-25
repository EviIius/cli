import { randomUUID } from "node:crypto";
import type { AdapterStreamEvent, ChatRequest, ChatResult, ModelAdapter } from "@relay/contracts";
import { textContent } from "../shared.js";

export class DemoAdapter implements ModelAdapter {
  readonly id = "demo:relay";
  readonly provider = "demo" as const;
  readonly model = "relay-demo-1";
  readonly capabilities = { tools: true, structuredOutput: true, streaming: true, selfHosted: true };
  readonly estimatedInputCostPerMillion = 0;
  readonly estimatedOutputCostPerMillion = 0;
  supports(): boolean { return true; }
  async invoke(request: ChatRequest): Promise<ChatResult> {
    const last = request.messages.at(-1)!;
    const latestUser = [...request.messages].reverse().find((m) => m.role === "user");
    const input = textContent(latestUser?.content ?? "");
    const incident = input.match(/(?:incident\s+)?([A-Z]{2,8}-\d+)/i)?.[1]?.toUpperCase();
    const statusTool = request.tools?.find((tool) => tool.name === "get_incident_status");
    if (incident && statusTool && last.role !== "tool") {
      return { provider: "demo", model: this.model, toolCalls: [{ id: randomUUID(), name: statusTool.name, arguments: { id: incident } }], traceId: randomUUID(), usage: { inputTokens: input.length / 4, outputTokens: 12, costUsd: 0 } };
    }
    const toolResult = typeof last.content === "object" && last.content ? last.content as { id?: string; status?: string; customerVisible?: boolean; updatedAt?: string } : undefined;
    const outputText = last.role === "tool" && toolResult
      ? `Incident ${toolResult.id ?? incident ?? "unknown"} is ${toolResult.status ?? "available"} and is ${toolResult.customerVisible ? "currently customer-visible" : "not customer-visible"}. The registry was updated at ${toolResult.updatedAt ?? "an unknown time"}. I can also assess impact or draft a stakeholder update.`
      : `Relay is running in local demo mode. You asked: “${input}”\n\nThe request passed through tenant policy, capability filtering, routing, and trace capture. Add a provider key to use a live model.`;
    return { provider: "demo", model: this.model, outputText, traceId: randomUUID(), usage: { inputTokens: Math.ceil(input.length / 4), outputTokens: Math.ceil(outputText.length / 4), costUsd: 0 } };
  }
  async *invokeStream(request:ChatRequest):AsyncGenerator<AdapterStreamEvent>{const result=await this.invoke(request); if(result.outputText){for(const chunk of result.outputText.match(/[\s\S]{1,24}/g)??[])yield{type:"delta",text:chunk};} yield{type:"result",result};}
  async health(){return{ok:true,latencyMs:0};}
}
