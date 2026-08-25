import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";
import type { AuthPrincipal, TenantRole } from "@relay/contracts";

const scrypt = promisify(scryptCallback);
type UserRecord = AuthPrincipal & { name: string; passwordHash: string };
type TokenPayload = AuthPrincipal & { exp: number; iat: number; iss:string; aud:string; sid:string; ver:1 };
const defaultTenantId = "00000000-0000-4000-8000-000000000001";

function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
async function hashPassword(password: string, salt = randomBytes(16).toString("hex")): Promise<string> { const key = await scrypt(password, salt, 64) as Buffer; return `${salt}:${key.toString("hex")}`; }
async function verifyPassword(password: string, encoded: string): Promise<boolean> { const [salt, expectedHex] = encoded.split(":"); if (!salt || !expectedHex) return false; const actual = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(expectedHex, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }

class AuthRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly pool?: Pool;
  constructor(connectionString?: string) { if (connectionString) this.pool = new Pool({ connectionString }); }
  async countUsers(): Promise<number> { if (!this.pool) return this.users.size; const result = await this.pool.query(`SELECT count(*)::int count FROM users`); return result.rows[0].count; }
  async findByEmail(email: string): Promise<UserRecord | undefined> {
    if (!this.pool) return this.users.get(email.toLowerCase());
    const result = await this.pool.query(`SELECT u.id user_id,u.email,u.name,u.password_hash,m.tenant_id,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE lower(u.email)=lower($1) ORDER BY m.created_at LIMIT 1`, [email]);
    const row = result.rows[0]; return row ? { userId: row.user_id, email: row.email, name: row.name, passwordHash: row.password_hash, tenantId: row.tenant_id, role: row.role } : undefined;
  }
  async create(email: string, name: string, passwordHash: string, tenantName: string): Promise<UserRecord> {
    const record: UserRecord = { userId: randomUUID(), email: email.toLowerCase(), name, passwordHash, tenantId: randomUUID(), role: "owner" };
    if (!this.pool) { this.users.set(record.email, record); return record; }
    const client = await this.pool.connect(); try { await client.query("BEGIN"); await client.query(`INSERT INTO tenants(id,slug,name,policy) VALUES($1::uuid,$2,$3,$4::jsonb)`, [record.tenantId, tenantName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || `tenant-${record.tenantId.slice(0,8)}`, tenantName, JSON.stringify({ tenantId: record.tenantId, allowedProviders:["openai","anthropic","mistral","qwen","gemini","gemma","local","demo"], externalProvidersAllowed:true, monthlyBudgetUsd:100, writeToolsRequireApproval:true })]); await client.query(`INSERT INTO users(id,email,name,password_hash) VALUES($1::uuid,$2,$3,$4)`, [record.userId, record.email, name, passwordHash]); await client.query(`INSERT INTO memberships(tenant_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner')`, [record.tenantId,record.userId]); await client.query("COMMIT"); return record; } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async ensureDevelopmentPrincipal(): Promise<void> {
    if (!this.pool) return;
    const userId="00000000-0000-4000-8000-000000000002";
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO tenants(id,slug,name,policy) VALUES($1::uuid,'relay-development','Relay Development',$2::jsonb) ON CONFLICT(id) DO NOTHING`,[defaultTenantId,JSON.stringify({tenantId:defaultTenantId,allowedProviders:["openai","anthropic","mistral","qwen","gemini","gemma","local","demo"],externalProvidersAllowed:true,monthlyBudgetUsd:100,writeToolsRequireApproval:true})]);
      await client.query(`INSERT INTO users(id,email,name,password_hash) VALUES($1::uuid,'developer@relay.local','Relay Developer','development-login-disabled') ON CONFLICT(id) DO NOTHING`,[userId]);
      await client.query(`INSERT INTO memberships(tenant_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner') ON CONFLICT(tenant_id,user_id) DO NOTHING`,[defaultTenantId,userId]);
      await client.query("COMMIT");
    } catch(error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async close(): Promise<void> { await this.pool?.end(); }
}

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly secret: string;
  readonly mode: "optional" | "required";
  private readonly issuer:string;private readonly audience:string;private readonly ttlSeconds:number;
  constructor(env: NodeJS.ProcessEnv = process.env) { this.repository = new AuthRepository(env.DATABASE_URL); this.secret = env.AUTH_SECRET ?? "relay-development-secret-change-before-production"; this.mode = env.AUTH_MODE === "required" ? "required" : "optional";this.issuer=env.AUTH_ISSUER??"relay-control-plane";this.audience=env.AUTH_AUDIENCE??"relay-web";this.ttlSeconds=Math.min(86_400,Math.max(300,Number(env.AUTH_TOKEN_TTL_SECONDS??28_800)));if (this.mode === "required" && !env.AUTH_SECRET) throw new Error("AUTH_SECRET is required when AUTH_MODE=required"); }
  async ready(): Promise<void> { if(this.mode==="optional") await this.repository.ensureDevelopmentPrincipal(); }
  async bootstrap(input: { email: string; password: string; name: string; tenantName: string }): Promise<{ token: string; principal: AuthPrincipal }> { if (await this.repository.countUsers() > 0) throw new Error("Bootstrap has already been completed"); if (input.password.length < 12) throw new Error("Password must contain at least 12 characters"); const user = await this.repository.create(input.email, input.name, await hashPassword(input.password), input.tenantName); return { token: this.sign(user), principal: this.principal(user) }; }
  async login(email: string, password: string): Promise<{ token: string; principal: AuthPrincipal } | undefined> { const user = await this.repository.findByEmail(email); if (!user || !await verifyPassword(password, user.passwordHash)) return undefined; return { token: this.sign(user), principal: this.principal(user) }; }
  verify(header: string | undefined): AuthPrincipal | undefined { const token=header?.startsWith("Bearer ")?header.slice(7):header;if(!token)return undefined;const [body,signature]=token.split(".");if(!body||!signature)return undefined;const expected=createHmac("sha256",this.secret).update(body).digest();const actual=Buffer.from(signature,"base64url");if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return undefined;try{const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8")) as TokenPayload;if(payload.exp<Math.floor(Date.now()/1000)||payload.iss!==this.issuer||payload.aud!==this.audience||payload.ver!==1)return undefined;return this.principal(payload);}catch{return undefined;} }
  developmentPrincipal(): AuthPrincipal { return { userId: "00000000-0000-4000-8000-000000000002", email: "developer@relay.local", tenantId: defaultTenantId, role: "owner" }; }
  authorize(principal: AuthPrincipal, roles: TenantRole[]): boolean { return roles.includes(principal.role); }
  async close(): Promise<void> { await this.repository.close(); }
  private sign(user: AuthPrincipal): string { const now=Math.floor(Date.now()/1000); const body=encode({...this.principal(user),iat:now,exp:now+this.ttlSeconds,iss:this.issuer,aud:this.audience,sid:randomUUID(),ver:1}); return `${body}.${createHmac("sha256",this.secret).update(body).digest("base64url")}`; }
  private principal(user: AuthPrincipal): AuthPrincipal { return { userId:user.userId,email:user.email,tenantId:user.tenantId,role:user.role }; }
}
