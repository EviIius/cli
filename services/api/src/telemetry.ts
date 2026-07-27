import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";

export function startTelemetry(env:NodeJS.ProcessEnv=process.env):NodeSDK|undefined{if(env.OTEL_SDK_DISABLED==="true")return;const exporter=env.OTEL_EXPORTER_OTLP_ENDPOINT?new OTLPTraceExporter():undefined;const sdk=new NodeSDK({serviceName:env.OTEL_SERVICE_NAME??"relay-api",traceExporter:exporter,instrumentations:[getNodeAutoInstrumentations({"@opentelemetry/instrumentation-fs":{enabled:false}})]});sdk.start();return sdk;}
