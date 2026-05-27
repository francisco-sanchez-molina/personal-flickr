import { defineMiddleware } from "astro:middleware";
import { isAuthed } from "./lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const authed = isAuthed(context.cookies);
  context.locals.user = authed ? { authenticated: true } : null;

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
