import {spawnSync} from "node:child_process";

const pnpmEntrypoint=process.env.npm_execpath;
const command=pnpmEntrypoint?process.execPath:"pnpm";
const args=pnpmEntrypoint?[pnpmEntrypoint,"licenses","list","--prod","--json"]:["licenses","list","--prod","--json"];
const result=spawnSync(command,args,{encoding:"utf8",maxBuffer:20*1024*1024});
if(result.status!==0){process.stderr.write(result.stderr||"Unable to inspect dependency licenses.\n");process.exit(result.status??1);}

const inventory=JSON.parse(result.stdout);
const denied=/^(?:AGPL|GPL)(?:-|$)|UNLICENSED|UNKNOWN/i;
const violations=Object.entries(inventory)
  .filter(([license])=>denied.test(license))
  .flatMap(([license,packages])=>packages.map((item)=>`${item.name}@${item.versions.join(",")} (${license})`));

if(violations.length){
  console.error("Disallowed or unknown production dependency licenses:\n"+violations.map(item=>`- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`License policy passed across ${Object.keys(inventory).length} license groups.`);
