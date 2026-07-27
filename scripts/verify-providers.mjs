import "dotenv/config";

const live=process.argv.includes("--live");
const compatibleLive=(baseUrl,key,model)=>({url:`${baseUrl}/chat/completions`,init:{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:"Reply with OK."}],max_tokens:64,temperature:0})}});
const providers=[
  {name:"OpenAI",key:process.env.OPENAI_API_KEY,authUrl:`${process.env.OPENAI_BASE_URL??"https://api.openai.com/v1"}/models`,headers:()=>({authorization:`Bearer ${process.env.OPENAI_API_KEY}`}),live:()=>({url:`${process.env.OPENAI_BASE_URL??"https://api.openai.com/v1"}/responses`,init:{method:"POST",headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_FAST_MODEL??"gpt-5.6-luna",input:"Reply with OK.",max_output_tokens:16})}})},
  {name:"Anthropic",key:process.env.ANTHROPIC_API_KEY,authUrl:"https://api.anthropic.com/v1/models",headers:()=>({"x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"}),live:()=>({url:"https://api.anthropic.com/v1/messages",init:{method:"POST",headers:{"x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL??"claude-sonnet-5",messages:[{role:"user",content:"Reply with OK."}],max_tokens:16})}})},
  {name:"Mistral",key:process.env.MISTRAL_API_KEY,authUrl:`${process.env.MISTRAL_BASE_URL??"https://api.mistral.ai/v1"}/models`,headers:()=>({authorization:`Bearer ${process.env.MISTRAL_API_KEY}`}),live:()=>compatibleLive(process.env.MISTRAL_BASE_URL??"https://api.mistral.ai/v1",process.env.MISTRAL_API_KEY,process.env.MISTRAL_MODEL??"mistral-large-latest")},
  {name:"Qwen",key:process.env.QWEN_API_KEY,authUrl:`${process.env.QWEN_BASE_URL??"https://dashscope-intl.aliyuncs.com/compatible-mode/v1"}/models`,headers:()=>({authorization:`Bearer ${process.env.QWEN_API_KEY}`}),live:()=>compatibleLive(process.env.QWEN_BASE_URL??"https://dashscope-intl.aliyuncs.com/compatible-mode/v1",process.env.QWEN_API_KEY,process.env.QWEN_MODEL??"qwen3.7-max")},
  {name:"Local",key:"local",authUrl:`${process.env.LOCAL_BASE_URL??"http://127.0.0.1:11434/v1"}/models`,headers:()=>({authorization:`Bearer ${process.env.LOCAL_API_KEY??"ollama"}`}),live:()=>compatibleLive(process.env.LOCAL_BASE_URL??"http://127.0.0.1:11434/v1",process.env.LOCAL_API_KEY??"ollama",process.env.LOCAL_MODEL??"qwen3:8b")}
];

async function checkedFetch(url,init={}){
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(120_000)});
  if(!response.ok){const payload=await response.json().catch(()=>({}));const detail=payload?.error?.code??payload?.error?.type??payload?.code;throw new Error(`HTTP ${response.status}${detail?` (${detail})`:""}`);}
}

let failures=0;
for(const provider of providers){
  if(!provider.key){console.log(`${provider.name.padEnd(10)} not configured`);continue;}
  const started=performance.now();
  try{await checkedFetch(provider.authUrl,{headers:provider.headers()});if(live){const request=provider.live();await checkedFetch(request.url,request.init);}console.log(`${provider.name.padEnd(10)} ${live?"live completion ready":"authenticated"} (${Math.round(performance.now()-started)}ms)`);}
  catch(error){failures+=1;console.error(`${provider.name.padEnd(10)} failed: ${error instanceof Error?error.message:"unknown error"}`);}
}
if(failures)process.exitCode=1;
