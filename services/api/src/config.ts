const placeholderSecrets=new Set(["relay-development-secret-change-before-production","change-this-to-at-least-32-random-characters"]);

export function parseAllowedOrigins(env:NodeJS.ProcessEnv):string[]{return(env.CORS_ALLOWED_ORIGINS??"").split(",").map(value=>value.trim()).filter(Boolean);}

export function assertSafeProductionConfiguration(env:NodeJS.ProcessEnv):void{
  if(env.NODE_ENV!=="production")return;
  if(env.AUTH_MODE!=="required")throw new Error("AUTH_MODE must be required in production");
  if(!env.AUTH_SECRET||env.AUTH_SECRET.length<32||placeholderSecrets.has(env.AUTH_SECRET))throw new Error("AUTH_SECRET must be a non-placeholder value of at least 32 characters");
  const origins=parseAllowedOrigins(env);
  if(!origins.length||origins.includes("*"))throw new Error("CORS_ALLOWED_ORIGINS must be a non-wildcard production allowlist");
  for(const origin of origins){const parsed=new URL(origin);if(parsed.protocol!=="https:")throw new Error("Production CORS origins must use HTTPS");}
}
