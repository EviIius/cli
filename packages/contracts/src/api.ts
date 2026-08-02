import {z} from "zod";

export const uuidSchema=z.string().uuid();
export const bootstrapSchema=z.object({email:z.string().email().max(320),password:z.string().min(12).max(256),name:z.string().trim().min(1).max(120),tenantName:z.string().trim().min(1).max(120)}).strict();
export const loginSchema=z.object({email:z.string().email().max(320),password:z.string().min(1).max(256)}).strict();
export const approvalDecisionSchema=z.object({status:z.enum(["approved","rejected"]),reason:z.string().trim().max(2000).optional(),idempotencyKey:z.string().min(8).max(200).optional()}).strict();
export const workflowStepSchema=z.object({id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),name:z.string().trim().min(1).max(120),prompt:z.string().trim().min(1).max(20_000),modelHint:z.string().max(200).optional()}).strict();
export const createJobSchema=z.object({type:z.enum(["single","planner-reviewer","adhoc"]),objective:z.string().trim().min(1).max(20_000),priority:z.enum(["fast","balanced","deep","private"]).optional(),steps:z.array(workflowStepSchema).min(1).max(32).optional()}).strict().superRefine((value,ctx)=>{if(value.type==="adhoc"&&!value.steps)ctx.addIssue({code:z.ZodIssueCode.custom,path:["steps"],message:"Ad hoc workflows require steps"});});
export const artifactUploadSchema=z.object({sessionId:uuidSchema,name:z.string().trim().min(1).max(255).regex(/^[^\\/:*?"<>|]+$/),mediaType:z.enum(["text/plain","text/markdown","text/csv","application/json"]),content:z.union([z.string().max(750_000),z.record(z.unknown()),z.array(z.unknown())])}).strict();
export const promptPromotionSchema=z.object({name:z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),version:z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),channel:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).default("production")}).strict();
export const retentionPurgeSchema=z.object({olderThanDays:z.number().int().min(1).max(3650)}).strict();
