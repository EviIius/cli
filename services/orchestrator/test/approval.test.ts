import assert from "node:assert/strict";
import test from "node:test";
import type { ModelAdapter } from "@relay/contracts";
import { ToolRunner } from "@relay/tool-runner";
import { Orchestrator } from "../src/index.js";

test("write tool calls suspend and resume through a persisted approval",async()=>{
  let calls=0;
  const adapter:ModelAdapter={id:"demo:relay",provider:"demo",model:"approval-test",capabilities:{tools:true,structuredOutput:true,streaming:false,selfHosted:true},estimatedInputCostPerMillion:0,estimatedOutputCostPerMillion:0,supports:()=>true,invoke:async(request)=>{calls+=1;const last=request.messages.at(-1);return last?.role==="tool"?{provider:"demo",model:"approval-test",outputText:`completed:${JSON.stringify(last.content)}`,traceId:"provider"}:{provider:"demo",model:"approval-test",toolCalls:[{id:"call-1",name:"write_record",arguments:{value:"new"}}],traceId:"provider"};}};
  const tools=new ToolRunner();let written=false;tools.register({name:"write_record",description:"Write",mode:"write",requiresApproval:true,inputSchema:{type:"object",properties:{value:{type:"string"}},required:["value"]}},async()=>{written=true;return{saved:true};});
  const orchestrator=new Orchestrator([adapter],tools);
  const initial=await orchestrator.run({tenantId:"tenant",sessionId:"session",priority:"balanced",messages:[{role:"user",content:"write it"}],metadata:{actorId:"actor"}});
  assert.equal(written,false);assert.equal(initial.result.pendingApprovals?.length,1);assert.equal(calls,1);
  const resumed=await orchestrator.resolveApproval(initial.result.pendingApprovals![0]!.id,"tenant","approver","approved");
  assert.equal(written,true);assert.match(resumed.resumed?.result.outputText??"",/completed/);assert.equal((await orchestrator.store.listApprovals("tenant","approved")).length,1);
});
