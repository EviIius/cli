import assert from "node:assert/strict";
import test from "node:test";
import { OpenAICompatibleAdapter, OpenAIResponsesAdapter } from "../src/index.js";

function sse(frames:unknown[]):Response{return new Response(frames.map(frame=>`data: ${JSON.stringify(frame)}\n\n`).join("")+"data: [DONE]\n\n",{status:200,headers:{"content-type":"text/event-stream"}});}
const request={tenantId:"t",sessionId:"s",priority:"fast" as const,messages:[{role:"user" as const,content:"hello"}]};

test("OpenAI-compatible streaming preserves deltas and usage",async()=>{
  const original=globalThis.fetch; globalThis.fetch=async()=>sse([{model:"local",choices:[{delta:{content:"hello "}}]},{choices:[{delta:{content:"world"}}]},{choices:[],usage:{prompt_tokens:2,completion_tokens:3}}]);
  try{const adapter=new OpenAICompatibleAdapter({id:"local:test",provider:"local",model:"local",apiKey:"x",baseUrl:"http://local",selfHosted:true,inputCostPerMillion:0,outputCostPerMillion:0});let text="",result:any;for await(const event of adapter.invokeStream(request)){if(event.type==="delta")text+=event.text;else result=event.result;}assert.equal(text,"hello world");assert.equal(result.outputText,text);assert.equal(result.usage.outputTokens,3);}finally{globalThis.fetch=original;}
});

test("OpenAI Responses streaming normalizes the completed response",async()=>{
  const original=globalThis.fetch; globalThis.fetch=async()=>sse([{type:"response.output_text.delta",delta:"ready"},{type:"response.completed",response:{model:"gpt-test",output:[{type:"message",content:[{type:"output_text",text:"ready"}]}],usage:{input_tokens:1,output_tokens:1}}}]);
  try{const adapter=new OpenAIResponsesAdapter({id:"openai:test",model:"gpt-test",apiKey:"x",baseUrl:"http://openai",inputCostPerMillion:1,outputCostPerMillion:2});let delta="",result:any;for await(const event of adapter.invokeStream(request)){if(event.type==="delta")delta+=event.text;else result=event.result;}assert.equal(delta,"ready");assert.equal(result.outputText,"ready");assert.equal(result.usage.costUsd,.000003);}finally{globalThis.fetch=original;}
});
