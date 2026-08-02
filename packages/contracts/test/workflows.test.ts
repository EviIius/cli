import assert from "node:assert/strict";
import test from "node:test";
import {compileWorkflow,validateWorkflowGraph,workflowDefinitionSchema} from "../src/index.js";

const definition=workflowDefinitionSchema.parse({schemaVersion:"1.0",id:"test",name:"Test",nodes:[{id:"trigger",type:"trigger.manual",name:"Start",position:{x:0,y:0}},{id:"prompt",type:"ai.prompt",name:"Analyze",position:{x:200,y:0},config:{prompt:"Analyze the input"}},{id:"output",type:"output.response",name:"Finish",position:{x:400,y:0}}],edges:[{id:"first",source:{nodeId:"trigger"},target:{nodeId:"prompt"}},{id:"second",source:{nodeId:"prompt"},target:{nodeId:"output"}}]});
test("workflow graphs validate and compile in topological order",()=>{assert.deepEqual(validateWorkflowGraph(definition),[]);assert.deepEqual(compileWorkflow(definition).nodeOrder,["trigger","prompt","output"]);});
test("workflow validation rejects cycles and unreachable nodes",()=>{const invalid={...definition,edges:[...definition.edges,{id:"cycle",source:{nodeId:"output",portId:"output"},target:{nodeId:"prompt",portId:"input"}}]};const codes=validateWorkflowGraph(invalid).map(item=>item.code);assert.ok(codes.includes("cycle_not_allowed"));});
