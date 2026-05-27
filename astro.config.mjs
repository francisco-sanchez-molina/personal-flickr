import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // We provide our own CSRF protection via SameSite=Lax + HttpOnly cookies.
  // Astro's `checkOrigin` compares the Origin header to url.origin, which is
  // unreliable behind reverse proxies (Coolify/Cloudflare Tunnel) where the
  // request's perceived host can drift from the externally-visible origin.
  security: { checkOrigin: false },
  vite: {
    server: {
      // Allow large RAW uploads (Canon CR2 ~30MB)
      fs: { allow: [".."] },
    },
  },
  server: {
    // Bind on all interfaces so LAN + tunnel can reach it without --host flag.
    host: true,
    port: 4321,
    // Vite 5+ blocks non-allowed Host headers (DNS-rebinding guard).
    // We accept any host because the app is already password-gated and we want
    // LAN access + Cloudflare Tunnel (random *.trycloudflare.com or custom domain).
    allowedHosts: true,
  },
});
