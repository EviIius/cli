export type JobStatus="queued"|"running"|"waiting_approval"|"succeeded"|"failed"|"cancelled";
export type JobRecord={id:string;tenantId:string;actorId?:string;type:"single"|"planner-reviewer"|"adhoc";status:JobStatus;input:Record<string,unknown>;state:Record<string,unknown>;result?:unknown;error?:string;createdAt:string;updatedAt:string};
export type ArtifactRecord={id:string;tenantId:string;jobId?:string;sessionId?:string;name:string;mediaType:string;content:unknown;sizeBytes:number;createdAt:string};
