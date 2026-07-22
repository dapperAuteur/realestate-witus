import { NextResponse } from "next/server";
import { auth, hasAuth } from "@/lib/auth";
import { DEMO_TENANT_SLUG } from "@/lib/demo/seed";
import { env, hasDemoLogin } from "@/lib/env";
import { err } from "@/lib/result";
import { resolveTenant } from "@/lib/tenant";

// "Try the demo" — the buttons POST role only; THIS route supplies the
// password from env (witus-learn pattern: the secret never reaches a
// browser). Only answers on the demo tenant's own host, and errors are
// deliberately generic regardless of cause.

const GENERIC = err("DEMO_UNAVAILABLE", "Demo sign-in isn't available right now.");

export async function POST(request: Request) {
  if (!hasAuth() || !hasDemoLogin) {
    return NextResponse.json(GENERIC, { status: 503 });
  }
  const tenant = await resolveTenant().catch(() => null);
  if (!tenant || tenant.slug !== DEMO_TENANT_SLUG) {
    return NextResponse.json(GENERIC, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const role = String(form?.get("role") ?? "");
  const lang = String(form?.get("lang") ?? "en");
  const credentials =
    role === "admin"
      ? { email: env.DEMO_ADMIN_USER_EMAIL, password: env.DEMO_ADMIN_PASSWORD }
      : role === "visitor"
        ? { email: env.DEMO_VISITOR_USER_EMAIL, password: env.DEMO_VISITOR_PASSWORD }
        : null;
  if (!credentials?.email || !credentials.password) {
    return NextResponse.json(GENERIC, { status: 400 });
  }

  try {
    const signIn = await auth().api.signInEmail({
      body: { email: credentials.email, password: credentials.password },
      headers: request.headers,
      asResponse: true,
    });
    if (!signIn.ok) {
      return NextResponse.json(GENERIC, { status: 401 });
    }
    // Land straight in the admin with the session cookie attached.
    const redirect = NextResponse.redirect(
      new URL(`/${lang}/admin`, request.url),
      303,
    );
    const cookie = signIn.headers.get("set-cookie");
    if (cookie) redirect.headers.set("set-cookie", cookie);
    return redirect;
  } catch {
    return NextResponse.json(GENERIC, { status: 401 });
  }
}
