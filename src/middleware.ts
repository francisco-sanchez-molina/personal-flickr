import { defineMiddleware } from "astro:middleware";
import { isAuthed } from "./lib/auth";
import { config } from "./lib/config";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const authed = isAuthed(context.cookies);
  // Single-user mode: the session cookie itself carries no identity, so
  // the "logged-in user" is simply whoever's credentials matched the env.
  // Surface that name to pages/components that want to show it.
  context.locals.user = authed ? { username: config.username } : null;

  if (PUBLIC_PATHS.has(pathname)) {
    if (authed && pathname === "/login") {
      return context.redirect("/");
    }
    return next();
  }

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return context.redirect("/login");
  }

  return next();
});
