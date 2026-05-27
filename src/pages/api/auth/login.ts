import type { APIRoute } from "astro";
import { login } from "~/lib/auth";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!login(cookies, password)) {
    return redirect("/login?error=1", 303);
  }
  return redirect("/", 303);
};
