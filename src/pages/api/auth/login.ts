import type { APIRoute } from "astro";
import { login } from "~/lib/auth";
import { clientKey, consume } from "~/lib/rate-limit";

/**
 * 5 attempts per minute per IP. README promises this; without it the
 * "password gate" is one short Python loop away from useless.
 *
 * Errors are deliberately uniform across "bad password" and "rate-
 * limited" so a brute-forcer can't tell from the response body whether a
 * specific username/IP is currently blocked vs. just wrong. The HTTP
 * status differs (303 vs 429) only for legitimate clients that read it.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const ip = clientKey(request, clientAddress ?? null);
  const rl = consume(`login:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!rl.ok) {
    // Tell the browser to back off. For the form-based flow this hits the
    // user-visible 429 page; for curl users they get the precise time.
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        detail: `Too many attempts. Retry in ${rl.retryAfter}s.`,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(rl.retryAfter),
        },
      },
    );
  }

  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!login(cookies, username, password)) {
    return redirect("/login?error=1", 303);
  }
  return redirect("/", 303);
};
