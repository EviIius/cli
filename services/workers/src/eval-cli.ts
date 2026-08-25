import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptersFromEnvironment } from "@relay/adapters";
import { Orchestrator } from "@relay/orchestrator";
import { createDefaultToolRunner } from "@relay/tool-runner";
import { runEvalDataset } from "./eval.js";

const root=fileURLToPath(new URL("../../../",import.meta.url));const dataset=process.argv[2]?resolve(process.argv[2]):resolve(root,"evals/datasets/smoke.jsonl");const reportPath=process.argv[3]?resolve(process.argv[3]):resolve(root,`evals/reports/smoke-${new Date().toISOString().replace(/[:.]/g,"-")}.json`);const report=await runEvalDataset(new Orchestrator(adaptersFromEnvironment({...process.env,LOCAL_BASE_URL:"disabled",OPENAI_API_KEY:""}),createDefaultToolRunner()),dataset,reportPath);console.log(JSON.stringify({reportPath,passed:report.passed,failed:report.failed,passRate:report.passRate},null,2));if(report.failed)process.exitCode=1;
