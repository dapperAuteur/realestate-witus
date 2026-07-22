import { NextResponse } from "next/server";
import { applyPaymentEvent } from "@/lib/payments/reservation-payments";
import { providerForTenant } from "@/lib/payments/tenant-provider";
import { err } from "@/lib/result";
import { writeAudit } from "@/lib/audit";
import { getTenantBySlug } from "@/lib/tenant";

// Per-tenant Paystack webhook (each hotel has its own Paystack account, so
// each gets its own endpoint: /api/webhooks/paystack/<tenant-slug>). Raw body
// is verified against x-paystack-signature before anything is parsed.
// Response policy: 401 only for bad signatures; everything after
// verification returns 200 (with an envelope) so Paystack stops retrying —
// idempotency lives on payments.provider_ref, not on retry suppression.
// PII rule: nothing from the payload is logged.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug).catch(() => null);
  if (!tenant) {
    return NextResponse.json(err("UNKNOWN_TENANT", "Unknown webhook target."), {
      status: 404,
    });
  }

  const provider = providerForTenant(tenant);
  if (!provider.ok) {
    return NextResponse.json(provider, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!provider.data.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json(err("BAD_SIGNATURE", "Signature mismatch."), {
      status: 401,
    });
  }

  const event = provider.data.parseWebhookEvent(rawBody);
  const result = await applyPaymentEvent(tenant.id, event);
  if (result.ok && result.data.applied && event.kind !== "ignored") {
    await writeAudit({
      tenantId: tenant.id,
      kind: "webhook.paystack",
      summary: `Payment ${event.kind === "payment_success" ? "succeeded" : "failed"}`,
      data: { providerRef: event.providerRef },
    });
  }
  return NextResponse.json(result, { status: 200 });
}
