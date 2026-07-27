import { randomUUID } from "node:crypto";
import type { AdapterStreamEvent, ChatRequest, ChatResult, ModelAdapter } from "@relay/contracts";
import { parseSse, textContent, providerFetch, providerResponse } from "../shared.js";

export class AnthropicAdapter implements ModelAdapter {
  readonly id = "anthropic:balanced";
  readonly provider = "anthropic" as const;
  readonly capabilities = { tools: true, structuredOutput: true, streaming: true, selfHosted: false };
  readonly estimatedInputCostPerMillion = 3;
  readonly estimatedOutputCostPerMillion = 15;
  constructor(readonly model: string, private readonly apiKey: string) {}
  supports(): boolean { return Boolean(this.apiKey); }
  async invoke(request: ChatRequest): Promise<ChatResult> {
    const system = request.messages.filter((m) => m.role === "system").map((m) => textContent(m.content)).join("\n");
    const messages = request.messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.role === "tool"
        ? [{ type: "tool_result", tool_use_id: m.toolCallId, content: textContent(m.content) }]
        : m.toolCalls?.length
          ? m.toolCalls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.arguments }))
          : textContent(m.content)
    }));
    const body = await providerFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: 2048, system: system || undefined, messages, tools: request.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) })
    }) as any;
    const text = body.content?.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
    const usage={ inputTokens: body.usage?.input_tokens, outputTokens: body.usage?.output_tokens };
    return {
      provider: "anthropic", model: body.model ?? this.model, outputText: text || undefined,
      toolCalls: body.content?.filter((item: any) => item.type === "tool_use").map((item: any) => ({ id: item.id, name: item.name, arguments: item.input })),
      usage: { ...usage, costUsd:((usage.inputTokens??0)*this.estimatedInputCostPerMillion+(usage.outputTokens??0)*this.estimatedOutputCostPerMillion)/1_000_000 }, traceId: randomUUID()
    };
  }
  async *invokeStream(request:ChatRequest):AsyncGenerator<AdapterStreamEvent>{
    const system=request.messages.filter(m=>m.role==="system").map(m=>textContent(m.content)).join("\n");
    const messages=request.messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.role==="tool"?[{type:"tool_result",tool_use_id:m.toolCallId,content:textContent(m.content)}]:m.toolCalls?.length?m.toolCalls.map(call=>({type:"tool_use",id:call.id,name:call.name,input:call.arguments})):textContent(m.content)}));
    const response=await providerResponse("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":this.apiKey,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:this.model,max_tokens:2048,stream:true,system:system||undefined,messages,tools:request.tools?.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema}))})});
    let text="",model=this.model,inputTokens=0,outputTokens=0; const calls=new Map<number,{id:string;name:string;arguments:string}>();
    for await(const frame of parseSse(response)){const event=JSON.parse(frame.data); if(event.type==="message_start"){model=event.message?.model??model;inputTokens=event.message?.usage?.input_tokens??0;} if(event.type==="content_block_start"&&event.content_block?.type==="tool_use")calls.set(event.index,{id:event.content_block.id,name:event.content_block.name,arguments:""}); if(event.type==="content_block_delta"&&event.delta?.type==="text_delta"){text+=event.delta.text;yield{type:"delta",text:event.delta.text};} if(event.type==="content_block_delta"&&event.delta?.type==="input_json_delta"){const call=calls.get(event.index);if(call)call.arguments+=event.delta.partial_json;} if(event.type==="message_delta")outputTokens=event.usage?.output_tokens??outputTokens;}
    const toolCalls=[...calls.values()].map(call=>({id:call.id,name:call.name,arguments:JSON.parse(call.arguments||"{}")})); yield{type:"result",result:{provider:"anthropic",model,outputText:text||undefined,toolCalls:toolCalls.length?toolCalls:undefined,usage:{inputTokens,outputTokens,costUsd:(inputTokens*this.estimatedInputCostPerMillion+outputTokens*this.estimatedOutputCostPerMillion)/1_000_000},traceId:randomUUID()}};
  }
  async health(){const started=performance.now();try{await providerFetch("https://api.anthropic.com/v1/models",{headers:{"x-api-key":this.apiKey,"anthropic-version":"2023-06-01"}},15_000);return{ok:true,latencyMs:performance.now()-started};}catch(error){return{ok:false,latencyMs:performance.now()-started,error:error instanceof Error?error.message:"Health check failed"};}}
}
