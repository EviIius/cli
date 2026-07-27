import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { "/v1": "http://localhost:4100", "/health": "http://localhost:4100", "/ready": "http://localhost:4100" } } });
