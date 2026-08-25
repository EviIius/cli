import "dotenv/config";
import { startTelemetry } from "./telemetry.js";

const port = Number(process.env.PORT ?? 4100);
const telemetry=startTelemetry();
const { createApp } = await import("./app.js");
const app = createApp();
app.addHook("onClose",async()=>{await telemetry?.shutdown();});
app.listen({ port, host: "0.0.0.0" }).catch((error) => { app.log.error(error); process.exit(1); });
