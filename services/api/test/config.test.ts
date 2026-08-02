import assert from "node:assert/strict";
import test from "node:test";
import {assertSafeProductionConfiguration,parseAllowedOrigins} from "../src/config.js";

test("production configuration fails closed for unsafe auth and CORS",()=>{
  assert.throws(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"optional"}),/AUTH_MODE/);
  assert.throws(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"short",CORS_ALLOWED_ORIGINS:"https://relay.example"}),/AUTH_SECRET/);
  assert.throws(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"x".repeat(40),CORS_ALLOWED_ORIGINS:"*"}),/non-wildcard/);
  assert.throws(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"x".repeat(40),CORS_ALLOWED_ORIGINS:"http://relay.example"}),/HTTPS/);
  assert.doesNotThrow(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"x".repeat(40),CORS_ALLOWED_ORIGINS:"https://relay.example"}));
  assert.deepEqual(parseAllowedOrigins({CORS_ALLOWED_ORIGINS:"https://one.example, https://two.example"}),["https://one.example","https://two.example"]);
  assert.deepEqual(parseAllowedOrigins({RENDER:"true",RENDER_EXTERNAL_URL:"https://relay-control-plane-free.onrender.com"}),["https://relay-control-plane-free.onrender.com"]);
  assert.doesNotThrow(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"x".repeat(40),RENDER:"true",RENDER_EXTERNAL_URL:"https://relay-control-plane-free.onrender.com"}));
  assert.doesNotThrow(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"x".repeat(40),CORS_ALLOWED_ORIGINS:"http://localhost:8080"}));
  assert.throws(()=>assertSafeProductionConfiguration({NODE_ENV:"production",AUTH_MODE:"required",AUTH_SECRET:"x".repeat(40),RENDER:"true",RENDER_EXTERNAL_URL:"http://relay-control-plane-free.onrender.com"}),/HTTPS/);
});
