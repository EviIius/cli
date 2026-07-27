export type AgentDefinition = {
  id: string;
  name: string;
  prompt: { name: string; version: string };
  priority: "fast" | "balanced" | "deep" | "private";
  tools: string[];
  maxSteps: number;
};

export type TenantPolicy = {
  tenantId: string;
  allowedProviders: string[];
  allowedModels?: string[];
  externalProvidersAllowed: boolean;
  monthlyBudgetUsd: number;
  writeToolsRequireApproval: boolean;
};

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
