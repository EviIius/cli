import { z } from "zod";

export const agentDefinitionSchema=z.object({id:z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),name:z.string().min(1).max(120),prompt:z.object({name:z.string().min(1).max(80),version:z.string().min(1).max(80)}).strict(),priority:z.enum(["fast","balanced","deep","private"]),tools:z.array(z.string().min(1).max(80)).max(50),maxSteps:z.number().int().min(1).max(32)}).strict();
export type AgentDefinition = {
  id: string;
  name: string;
  prompt: { name: string; version: string };
  priority: "fast" | "balanced" | "deep" | "private";
  tools: string[];
  maxSteps: number;
};

export const tenantPolicySchema=z.object({tenantId:z.string().uuid(),allowedProviders:z.array(z.string().min(1).max(80)).max(50),allowedModels:z.array(z.string().min(1).max(200)).max(500).optional(),externalProvidersAllowed:z.boolean(),monthlyBudgetUsd:z.number().finite().nonnegative().max(1_000_000),writeToolsRequireApproval:z.boolean()}).strict();
export type TenantPolicy=z.infer<typeof tenantPolicySchema>;

export type TenantRole = "owner" | "admin" | "builder" | "viewer";
export type AuthPrincipal = { userId: string; email: string; tenantId: string; role: TenantRole };
export type AuditEvent = {
  id: string;
  tenantId: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  traceId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
