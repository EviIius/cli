import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow,
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import { Check, CircleAlert, CloudUpload, Play, Plus, Save, Trash2, Workflow } from "lucide-react";
import { create } from "zustand";
import * as api from "../../api";
import "@xyflow/react/dist/style.css";

type CanvasData={label:string;kind:api.WorkflowNodeType};
type CanvasNode=Node<CanvasData>;
type StudioStore={selectedId:string;setSelectedId:(id:string)=>void};
const useStudio=create<StudioStore>(set=>({selectedId:"",setSelectedId:selectedId=>set({selectedId})}));

const fallbackTypes:api.NodeTypeDescriptor[]=[
  {type:"trigger.manual",group:"Triggers",label:"Manual trigger",outputs:["output"]},
  {type:"ai.prompt",group:"AI",label:"Prompt / model",inputs:["input"],outputs:["output"]},
  {type:"human.approval",group:"Human",label:"Approval",inputs:["subject"],outputs:["approved"]},
  {type:"data.transform",group:"Data",label:"Transform",inputs:["input"],outputs:["output"]},
  {type:"control.condition",group:"Control",label:"Condition",inputs:["input"],outputs:["true","false"]},
  {type:"output.response",group:"Outputs",label:"Response",inputs:["input"]},
];

function GraphNode({data,selected}:NodeProps<CanvasNode>){
  const terminal=data.kind.startsWith("output."),trigger=data.kind.startsWith("trigger.");
  return <div className={`graph-node-card ${selected?"selected":""}`}>
    {!trigger&&<Handle type="target" position={Position.Left}/>}
    <span>{data.kind}</span>
    <strong>{data.label}</strong>
    {!terminal&&<Handle type="source" position={Position.Right}/>}
  </div>;
}
const nodeTypes={relay:GraphNode};
const nodeId=()=>`node_${crypto.randomUUID().replaceAll("-","").slice(0,12)}`;
const edgeId=()=>`edge_${crypto.randomUUID().replaceAll("-","").slice(0,12)}`;
const toCanvas=(node:api.WorkflowNode):CanvasNode=>({id:node.id,type:"relay",position:node.position,data:{label:node.name,kind:node.type}});
const toEdge=(edge:api.WorkflowEdge):Edge=>({id:edge.id,source:edge.source.nodeId,target:edge.target.nodeId,sourceHandle:edge.source.portId,targetHandle:edge.target.portId,label:edge.label});

export function WorkflowStudio({jobs,refresh}:{jobs:api.Job[];refresh:()=>Promise<void>}){
  const queryClient=useQueryClient(),selectedId=useStudio(value=>value.selectedId),setSelectedId=useStudio(value=>value.setSelectedId);
  const workflows=useQuery({queryKey:["workflows"],queryFn:api.getWorkflows});
  const nodeCatalog=useQuery({queryKey:["node-types"],queryFn:api.getNodeTypes});
  const [workflowId,setWorkflowId]=useState(""),[draft,setDraft]=useState<api.WorkflowDraft|null>(null),[nodes,setNodes]=useState<CanvasNode[]>([]),[edges,setEdges]=useState<Edge[]>([]);
  const [diagnostics,setDiagnostics]=useState<api.WorkflowDiagnostic[]>([]),[notice,setNotice]=useState(""),[runInput,setRunInput]=useState("{}"),[selectedRun,setSelectedRun]=useState("");
  const draftQuery=useQuery({queryKey:["workflow-draft",workflowId],queryFn:()=>api.getWorkflowDraft(workflowId),enabled:Boolean(workflowId)});
  const versions=useQuery({queryKey:["workflow-versions",workflowId],queryFn:()=>api.getWorkflowVersions(workflowId),enabled:Boolean(workflowId)});

  useEffect(()=>{const first=workflows.data?.items[0];if(!workflowId&&first)setWorkflowId(first.id);},[workflows.data,workflowId]);
  useEffect(()=>{if(!draftQuery.data)return;setDraft(draftQuery.data);setNodes(draftQuery.data.definition.nodes.map(toCanvas));setEdges(draftQuery.data.definition.edges.map(toEdge));setDiagnostics([]);},[draftQuery.data]);
  useEffect(()=>{const active=jobs.find(job=>job.id===selectedRun);if(!active||!["queued","running","waiting_approval"].includes(active.status))return;const timer=window.setInterval(()=>void refresh(),1200);return()=>clearInterval(timer);},[jobs,selectedRun,refresh]);

  const definition=useMemo<api.WorkflowDefinition|null>(()=>draft?{
    ...draft.definition,
    nodes:draft.definition.nodes.filter(saved=>nodes.some(node=>node.id===saved.id)).map(saved=>{const canvas=nodes.find(node=>node.id===saved.id)!;return{...saved,name:canvas.data.label,position:canvas.position};}),
    edges:edges.map(edge=>({id:edge.id,source:{nodeId:edge.source,portId:edge.sourceHandle??"output"},target:{nodeId:edge.target,portId:edge.targetHandle??"input"},...(typeof edge.label==="string"?{label:edge.label}:{})})),
  }:null,[draft,nodes,edges]);
  const selected=definition?.nodes.find(node=>node.id===selectedId);
  const types=nodeCatalog.data??fallbackTypes;
  const typeGroups=types.reduce<Record<string,api.NodeTypeDescriptor[]>>((groups,item)=>{(groups[item.group]??=[]).push(item);return groups;},{});
  const run=jobs.find(job=>job.id===selectedRun)??jobs.find(job=>job.type==="graph");

  const createWorkflow=useMutation({mutationFn:()=>api.createWorkflow("Launch readiness review","A governed example with model analysis and human approval."),onSuccess:async result=>{await queryClient.invalidateQueries({queryKey:["workflows"]});setWorkflowId(result.workflow.id);setDraft(result.draft);setNotice("Example workflow created.");}});
  const save=useMutation({mutationFn:async()=>{if(!definition||!draft)throw new Error("No draft is open.");return api.saveWorkflowDraft(workflowId,draft.revision,definition);},onSuccess:value=>{setDraft(value);setNotice(`Draft revision ${value.revision} saved.`);void queryClient.invalidateQueries({queryKey:["workflow-draft",workflowId]});},onError:error=>setNotice(error.message)});
  const validate=useMutation({mutationFn:async()=>{if(!definition)throw new Error("No draft is open.");return api.validateWorkflow(workflowId,definition);},onSuccess:value=>{setDiagnostics(value.diagnostics);setNotice(value.valid?"Workflow is valid and ready to publish.":"Fix the highlighted validation issues.");},onError:error=>setNotice(error.message)});
  const publish=useMutation({mutationFn:async()=>{if(!definition||!draft)throw new Error("No draft is open.");const saved=await api.saveWorkflowDraft(workflowId,draft.revision,definition);setDraft(saved);const checked=await api.validateWorkflow(workflowId,saved.definition);setDiagnostics(checked.diagnostics);if(!checked.valid)throw new Error("Resolve validation errors before publishing.");return api.publishWorkflow(workflowId,"Published from the visual workflow studio");},onSuccess:value=>{setNotice(`Version ${value.versionNumber} published with immutable hash ${value.contentHash.slice(0,10)}…`);void queryClient.invalidateQueries({queryKey:["workflow-versions",workflowId]});},onError:error=>setNotice(error.message)});
  const start=useMutation({mutationFn:async()=>{const version=versions.data?.items[0];if(!version)throw new Error("Publish a valid version before running it.");let input:Record<string,unknown>;try{input=JSON.parse(runInput) as Record<string,unknown>;}catch{throw new Error("Run input must be valid JSON.");}return api.runWorkflow(version.id,input);},onSuccess:async job=>{setSelectedRun(job.id);setNotice("Run started. Progress will update below.");await refresh();},onError:error=>setNotice(error.message)});

  const onNodesChange=useCallback((changes:NodeChange<CanvasNode>[])=>setNodes(current=>applyNodeChanges(changes,current)),[]);
  const onEdgesChange=useCallback((changes:EdgeChange<Edge>[])=>setEdges(current=>applyEdgeChanges(changes,current)),[]);
  const connect=useCallback((connection:Connection)=>setEdges(current=>addEdge({...connection,id:edgeId()},current)),[]);
  const addNode=(descriptor:api.NodeTypeDescriptor)=>{if(!draft)return;const id=nodeId(),node:api.WorkflowNode={id,type:descriptor.type,typeVersion:"1.0.0",name:descriptor.label,position:{x:220+nodes.length%3*250,y:100+Math.floor(nodes.length/3)*150},config:descriptor.type==="ai.prompt"?{prompt:"Describe the task this model should complete."}:descriptor.type==="human.approval"?{instructions:"Review the previous output before continuing."}:{}};setDraft({...draft,definition:{...draft.definition,nodes:[...draft.definition.nodes,node]}});setNodes(current=>[...current,toCanvas(node)]);setSelectedId(id);};
  const updateSelected=(patch:Partial<api.WorkflowNode>)=>{if(!draft||!selected)return;setDraft({...draft,definition:{...draft.definition,nodes:draft.definition.nodes.map(node=>node.id===selected.id?{...node,...patch}:node)}});setNodes(current=>current.map(node=>node.id===selected.id?{...node,data:{...node.data,label:patch.name??node.data.label}}:node));};
  const removeSelected=()=>{if(!selected)return;setNodes(current=>current.filter(node=>node.id!==selected.id));setEdges(current=>current.filter(edge=>edge.source!==selected.id&&edge.target!==selected.id));setSelectedId("");};

  return <section className="page workflow-studio-page">
    <div className="page-title"><div><span className="eyebrow">CONTROL PLANE</span><h2>Workflow studio</h2><p>Design, validate, publish, and run recoverable model workflows from one end-to-end canvas.</p></div><div className="studio-actions"><button className="secondary-button" disabled={!draft||save.isPending} onClick={()=>save.mutate()}><Save size={14}/>Save draft</button><button className="secondary-button" disabled={!draft||validate.isPending} onClick={()=>validate.mutate()}><Check size={14}/>Validate</button><button className="primary compact" disabled={!draft||publish.isPending} onClick={()=>publish.mutate()}><CloudUpload size={14}/>Publish</button></div></div>
    {!workflowId&&<div className="workflow-empty"><Workflow size={28}/><h3>Start with a complete example</h3><p>Relay will create a manual trigger, model step, human approval, and response node that you can edit.</p><button className="primary" disabled={createWorkflow.isPending} onClick={()=>createWorkflow.mutate()}><Plus size={15}/>Create example workflow</button></div>}
    {workflowId&&<>
      <div className="studio-toolbar"><label>Workflow<select value={workflowId} onChange={event=>setWorkflowId(event.target.value)}>{workflows.data?.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>Draft r{draft?.revision??"—"}</span><span>{versions.data?.items.length??0} published version(s)</span>{notice&&<output>{notice}</output>}</div>
      <div className="studio-grid">
        <aside className="node-library"><span className="eyebrow">NODE LIBRARY</span>{Object.entries(typeGroups).map(([group,items])=><section key={group}><h3>{group}</h3>{items.map(item=><button key={item.type} onClick={()=>addNode(item)}><Plus size={13}/><span><strong>{item.label}</strong><small>{item.type}</small></span></button>)}</section>)}</aside>
        <div className="graph-canvas" role="application" aria-label="Workflow graph canvas">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onNodeClick={(_event,node)=>setSelectedId(node.id)} fitView snapToGrid snapGrid={[20,20]} deleteKeyCode={["Backspace","Delete"]}><Background color="#33413d" gap={20}/><MiniMap pannable zoomable/><Controls/></ReactFlow>
        </div>
        <aside className="node-inspector"><span className="eyebrow">INSPECTOR</span>{selected?<><label>Name<input value={selected.name} onChange={event=>updateSelected({name:event.target.value})}/></label><label>Type<input value={selected.type} disabled/></label>{selected.type==="ai.prompt"&&<label>Prompt<textarea value={String(selected.config.prompt??"")} onChange={event=>updateSelected({config:{...selected.config,prompt:event.target.value}})}/></label>}<label>Description<textarea value={selected.metadata?.description??""} onChange={event=>updateSelected({metadata:{...selected.metadata,description:event.target.value}})}/></label><label>Timeout (ms)<input type="number" value={selected.timeoutMs??300000} onChange={event=>updateSelected({timeoutMs:Number(event.target.value)})}/></label><button className="danger" onClick={removeSelected}><Trash2 size={13}/>Remove node</button></>:<p>Select a node to edit its configuration.</p>}</aside>
      </div>
      <div className="studio-lower">
        <section className="workflow-outline"><div><span className="eyebrow">ACCESSIBLE OUTLINE</span><p>Keyboard-friendly alternative to the canvas.</p></div>{definition?.nodes.map((node,index)=><button className={node.id===selectedId?"active":""} key={node.id} onClick={()=>setSelectedId(node.id)}><em>{index+1}</em><span><strong>{node.name}</strong><small>{node.type}</small></span></button>)}</section>
        <section className="validation-panel"><span className="eyebrow">VALIDATION</span>{diagnostics.length?diagnostics.map(item=><button key={`${item.code}-${item.nodeId??item.edgeId??"graph"}`} onClick={()=>item.nodeId&&setSelectedId(item.nodeId)}><CircleAlert size={14}/><span><strong>{item.message}</strong><small>{item.code}</small></span></button>):<p>No validation findings. Select Validate to check the current draft.</p>}</section>
        <section className="run-launcher"><span className="eyebrow">RUN PUBLISHED VERSION</span><label>JSON input<textarea value={runInput} onChange={event=>setRunInput(event.target.value)}/></label><button className="primary" disabled={start.isPending||!versions.data?.items.length} onClick={()=>start.mutate()}><Play size={14}/>Run latest version</button></section>
      </div>
    </>}
    {run&&<section className="run-panel"><div className="run-panel-head"><div><span className="eyebrow">RUN EXECUTION</span><h3>{String(run.input.objective)}</h3><p>{run.id.slice(0,8)} · {new Date(run.createdAt).toLocaleString()}</p></div><span className={`status ${run.status}`}>{run.status}</span></div><div className="graph-run-state"><strong>{String(run.state.stage??"Queued")}</strong><span>Node {Number(run.state.currentNodeIndex??0)+1} of {Array.isArray(run.input.nodeOrder)?run.input.nodeOrder.length:"—"}</span></div>{run.status==="waiting_approval"&&<p className="run-callout">This run is waiting for a decision in Approvals.</p>}{run.error&&<p className="form-error">{run.error}</p>}</section>}
  </section>;
}
