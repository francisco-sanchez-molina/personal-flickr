#!/usr/bin/env node
/**
 * Starts a Cloudflare quick-tunnel pointing at the local server.
 *
 * - Auto-installs the `cloudflared` binary on first run (into node_modules).
 * - Captures the public https://*.trycloudflare.com URL and prints it.
 * - Forwards SIGINT/SIGTERM to the tunnel for clean shutdown.
 *
 * Usage:
 *   node scripts/tunnel.mjs              # defaults to http://localhost:4321
 *   PORT=3000 node scripts/tunnel.mjs    # override port
 */
import fs from "node:fs";
import { bin, install, Tunnel } from "cloudflared";

const port = Number(process.env.PORT ?? 4321);
const url = `http://localhost:${port}`;

if (!fs.existsSync(bin)) {
  console.log("  ⬇️  Descargando cloudflared (solo la primera vez)…");
  await install(bin);
  console.log("     ✓ instalado en", bin);
}

console.log(`\n  🌐 Iniciando Cloudflare Tunnel hacia ${url}…\n`);

const tunnel = Tunnel.quick(url);
let publicUrl = null;

tunnel.on("url", (u) => {
  publicUrl = u;
  console.log("  ┌──────────────────────────────────────────────────────────────");
  console.log(`  │ ✅ URL pública: ${u}`);
  console.log("  │    Pídela en el navegador → te pedirá el password de la app");
  console.log("  └──────────────────────────────────────────────────────────────\n");
});

tunnel.on("connected", (conn) => {
  console.log(`  • conectado a ${conn.location} (${conn.id.slice(0, 8)}…)`);
});

tunnel.on("error", (err) => {
  console.error("  ⚠️  tunnel error:", err.message);
});

tunnel.on("exit", (code, signal) => {
  console.log(`  • cloudflared terminó (code=${code} signal=${signal ?? "-"})`);
  process.exit(code ?? 0);
});

const shutdown = (sig) => {
  console.log(`\n  Recibido ${sig}, cerrando túnel…`);
  tunnel.stop();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
