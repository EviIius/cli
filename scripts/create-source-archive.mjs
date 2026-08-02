import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";

const directory=resolve(".source-archives");
mkdirSync(directory,{recursive:true});
const output=resolve(directory,"relay-control-plane-source.zip");
const result=spawnSync("git",["archive","--format=zip","--prefix=relay-control-plane/",`--output=${output}`,"HEAD"],{stdio:"inherit"});
if(result.status!==0)process.exit(result.status??1);
console.log(`Created tracked-source archive: ${output}`);
