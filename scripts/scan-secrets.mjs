import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
const patterns=[
  {name:"OpenAI-style API key",value:/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g},
  {name:"Google API key",value:/\bAIza[0-9A-Za-z_-]{30,}\b/g},
  {name:"Private key",value:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g},
  {name:"Assigned secret",value:/^(?:[A-Z0-9_]*(?:API_KEY|AUTH_SECRET|PASSWORD|TOKEN))=["']?(?!change-|example|disabled|ollama)[^\s"']{16,}["']?$/gm}
];
const findings=[];
for(const file of files){let content;try{content=readFileSync(file,"utf8");}catch{continue;}for(const pattern of patterns){pattern.value.lastIndex=0;if(pattern.value.test(content))findings.push(`${file}: ${pattern.name}`);}}
if(findings.length){console.error("Potential secrets detected in tracked files:\n"+findings.join("\n"));process.exit(1);}
console.log(`Secret scan passed for ${files.length} tracked and untracked source files.`);
