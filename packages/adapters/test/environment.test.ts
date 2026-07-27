import assert from "node:assert/strict";
import test from "node:test";
import { adaptersFromEnvironment } from "../src/index.js";

test("configures self-hosted OpenAI-compatible Qwen, Mistral, and Gemma routes",()=>{
  const adapters=adaptersFromEnvironment({
    LOCAL_BASE_URL:"disabled",
    QWEN_API_KEY:"qwen-key",QWEN_BASE_URL:"https://qwen.example/v1",QWEN_SELF_HOSTED:"true",
    MISTRAL_API_KEY:"mistral-key",MISTRAL_BASE_URL:"https://mistral.example/v1",MISTRAL_SELF_HOSTED:"true",
    GEMMA_API_KEY:"gemma-key",GEMMA_BASE_URL:"https://gemma.example/v1",GEMMA_SELF_HOSTED:"true"
  });
  for(const id of ["qwen:balanced","mistral:balanced","gemma:balanced"]){
    const adapter=adapters.find(item=>item.id===id);
    assert.ok(adapter,`${id} should be configured`);
    assert.equal(adapter.capabilities.selfHosted,true);
  }
});
