import { randomUUID } from "node:crypto";
import type { AdapterStreamEvent, ChatRequest, ChatResult, ModelAdapter, Provider, ToolCall } from "@relay/contracts";
import { normalizeMessages, parseSse, providerFetch, providerResponse } from "../shared.js";

type Config = { id: string; provider: Provider; model: string; apiKey: string; baseUrl: string; inputCostPerMillion?: number; outputCostPerMillion?: number; selfHosted?:boolean; timeoutMs?:number };

export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly capabilities;
  readonly estimatedInputCostPerMillion: number;
  readonly estimatedOutputCostPerMillion: number;
  readonly id: string;
  readonly provider: Provider;
  readonly model: string;
  constructor(private readonly config: Config) {
    this.id = config.id;
    this.provider = config.provider;
    this.model = config.model;
    this.estimatedInputCostPerMillion = config.inputCostPerMillion ?? 1;
    this.estimatedOutputCostPerMillion = config.outputCostPerMillion ?? 3;
    this.capabilities={tools:true,structuredOutput:true,streaming:true,selfHosted:config.selfHosted??false};
  }
  supports(): boolean { return Boolean(this.config.apiKey); }
  async invoke(request: ChatRequest): Promise<ChatResult> {
    const payload = {
      model: this.model,
      messages: normalizeMessages(request.messages),
      tools: request.tools?.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
      response_format: request.responseSchema ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: request.responseSchema } } : undefined
    };
    const body = await providerFetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload)
    },this.config.timeoutMs) as any;
    const message = body.choices?.[0]?.message ?? {};
    const usage={ inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens };
    return {
      provider: this.provider,
      model: body.model ?? this.model,
      outputText: message.content ?? undefined,
      toolCalls: message.tool_calls?.map((call: any) => ({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") })),
      usage: { ...usage, costUsd:((usage.inputTokens??0)*this.estimatedInputCostPerMillion+(usage.outputTokens??0)*this.estimatedOutputCostPerMillion)/1_000_000 },
      traceId: randomUUID()
    };
  }
  async *invokeStream(request:ChatRequest):AsyncGenerator<AdapterStreamEvent>{const payload:any={model:this.model,messages:normalizeMessages(request.messages),stream:true,stream_options:{include_usage:true},tools:request.tools?.map(tool=>({type:"function",function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}}))}; const response=await providerResponse(`${this.config.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",headers:{authorization:`Bearer ${this.config.apiKey}`,"content-type":"application/json"},body:JSON.stringify(payload)},this.config.timeoutMs); let text=""; const calls=new Map<number,{id?:string;name:string;arguments:string}>(); let usage:any={}; let model=this.model; for await(const frame of parseSse(response)){if(frame.data==="[DONE]")continue; const body=JSON.parse(frame.data); model=body.model??model; usage=body.usage??usage; const delta=body.choices?.[0]?.delta; if(delta?.content){text+=delta.content;yield{type:"delta",text:delta.content};} for(const part of delta?.tool_calls??[]){const current=calls.get(part.index)??{id:part.id,name:part.function?.name??"",arguments:""}; current.id=part.id??current.id; current.name=part.function?.name??current.name; current.arguments+=part.function?.arguments??""; calls.set(part.index,current);}} const toolCalls:ToolCall[]=[...calls.values()].map(call=>({id:call.id,name:call.name,arguments:JSON.parse(call.arguments||"{}")})); const inputTokens=usage.prompt_tokens??0,outputTokens=usage.completion_tokens??0; yield{type:"result",result:{provider:this.provider,model,outputText:text||undefined,toolCalls:toolCalls.length?toolCalls:undefined,usage:{inputTokens,outputTokens,costUsd:(inputTokens*this.estimatedInputCostPerMillion+outputTokens*this.estimatedOutputCostPerMillion)/1_000_000},traceId:randomUUID()}};}
  async health(){const started=performance.now();try{await providerFetch(`${this.config.baseUrl.replace(/\/$/,"")}/models`,{headers:{authorization:`Bearer ${this.config.apiKey}`}},15_000);return{ok:true,latencyMs:performance.now()-started};}catch(error){return{ok:false,latencyMs:performance.now()-started,error:error instanceof Error?error.message:"Health check failed"};}}
}
