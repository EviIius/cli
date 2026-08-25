const placeholderSecrets=new Set(["relay-development-secret-change-before-production","change-this-to-at-least-32-random-characters"]);

export function parseAllowedOrigins(env:NodeJS.ProcessEnv):string[]{
  const configured=(env.CORS_ALLOWED_ORIGINS??"").split(",").map(value=>value.trim()).filter(Boolean);
  if(configured.length)return configured;
  if(env.RENDER==="true"&&env.RENDER_EXTERNAL_URL)return[env.RENDER_EXTERNAL_URL.trim()].filter(Boolean);
  return[];
}

export function assertSafeProductionConfiguration(env:NodeJS.ProcessEnv):void{
  if(env.NODE_ENV!=="production")return;
  if(env.AUTH_MODE!=="required")throw new Error("AUTH_MODE must be required in production");
  if(!env.AUTH_SECRET||env.AUTH_SECRET.length<32||placeholderSecrets.has(env.AUTH_SECRET))throw new Error("AUTH_SECRET must be a non-placeholder value of at least 32 characters");
  const origins=parseAllowedOrigins(env);
  if(!origins.length||origins.includes("*"))throw new Error("CORS_ALLOWED_ORIGINS must be a non-wildcard production allowlist");
  for(const origin of origins){
    const parsed=new URL(origin);
    const loopback=parsed.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(parsed.hostname);
    if(parsed.protocol!=="https:"&&!loopback)throw new Error("Production CORS origins must use HTTPS except for loopback-only local hosting");
  }
}
