const sensitiveKey=/(api[-_]?key|authorization|password|secret|token|credential|cookie)/i;
const secretPattern=/(sk-(?:ant-|ws-|sp-)?[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~-]{12,})/gi;
export function redactText(value:string):string{return value.replace(secretPattern,"[REDACTED]");}
export function redactValue(value:unknown,depth=0):unknown{if(depth>12)return"[TRUNCATED]";if(typeof value==="string")return redactText(value);if(Array.isArray(value))return value.map(item=>redactValue(item,depth+1));if(value&&typeof value==="object"){return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,sensitiveKey.test(key)?"[REDACTED]":redactValue(item,depth+1)]));}return value;}
export function safeError(error:unknown):string{return redactText(error instanceof Error?error.message:"Unknown error").slice(0,1000);}
