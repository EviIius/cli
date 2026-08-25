import { Ajv,type ValidateFunction } from "ajv";
import type { TenantPolicy, ToolContext, ToolExecution, ToolHandler, ToolSpec } from "@relay/contracts";

type RegisteredTool = { spec: ToolSpec; handler: ToolHandler };

export class ToolRunner {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly ajv = new Ajv({ allErrors: true, strict: true,allowUnionTypes:false });
  private readonly validators=new Map<string,ValidateFunction>();

  register(spec: ToolSpec, handler: ToolHandler): void {
    if (this.tools.has(spec.name)) throw new Error(`Tool ${spec.name} is already registered`);
    this.tools.set(spec.name, { spec, handler });
  }

  specs(): ToolSpec[] { return [...this.tools.values()].map(({ spec }) => spec); }

  async execute(name: string, input: unknown, context: Omit<ToolContext, "signal">, policy: TenantPolicy): Promise<ToolExecution> {
    const started = performance.now();
    const registered = this.tools.get(name);
    if (!registered) return { tool: name, status: "failed", error: "Unknown tool", durationMs: performance.now() - started };
    const requiresApproval = registered.spec.requiresApproval || (registered.spec.mode === "write" && policy.writeToolsRequireApproval);
    if (requiresApproval && !context.approved) return { tool: name, status: "approval_required", durationMs: performance.now() - started };
    const validatorKey=`${registered.spec.name}@${registered.spec.version??"1.0.0"}`;
    let validate=this.validators.get(validatorKey);if(!validate){validate=this.ajv.compile(registered.spec.inputSchema);this.validators.set(validatorKey,validate);}
    if (!validate(input)) return { tool: name, status: "failed", error: this.ajv.errorsText(validate.errors), durationMs: performance.now() - started };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), registered.spec.timeoutMs ?? 10_000);
    try {
      const output = await registered.handler(input, { ...context, signal: controller.signal });
      if(Buffer.byteLength(JSON.stringify(output??null))>(registered.spec.maximumOutputBytes??1_048_576))return{tool:name,status:"failed",error:"Tool output exceeded its configured size limit",durationMs:performance.now()-started};
      return { tool: name, status: "succeeded", output, durationMs: performance.now() - started };
    } catch (error) {
      return { tool: name, status: "failed", error: error instanceof Error ? error.message : "Tool failed", durationMs: performance.now() - started };
    } finally { clearTimeout(timer); }
  }
}
