import { env, hasMailgun } from "@/lib/env";

// Mailgun via raw REST (tour-manager-os pattern — no SDK dependency), with
// witus-learn's per-tenant sender: `from` comes from the tenant row so hotel
// mail sends as the hotel, never as "Stay.WitUS". Without Mailgun configured
// it logs to the console so magic links still work in local dev.

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Per-tenant sender (tenants.email.from). Falls back to MAIL_FROM. */
  from?: string;
  replyTo?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from,
  replyTo,
}: SendEmailInput): Promise<{ id: string | null }> {
  const sender = from ?? env.MAIL_FROM;

  if (!hasMailgun) {
    console.log(
      `[mailer:dev] (Mailgun not configured — logging instead)\n  From: ${sender}\n  To: ${to}\n  Subject: ${subject}\n  ${text}`,
    );
    return { id: null };
  }

  const base =
    env.MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const form = new FormData();
  form.set("from", sender);
  form.set("to", to);
  form.set("subject", subject);
  form.set("text", text);
  if (html) form.set("html", html);
  if (replyTo) form.set("h:Reply-To", replyTo);

  const res = await fetch(`${base}/v3/${env.MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString("base64")}`,
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mailgun send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  return { id: json?.id ?? null };
}
