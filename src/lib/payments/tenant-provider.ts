import { err, ok, type Result } from "@/lib/result";
import type { TenantRecord } from "@/lib/tenant";
import { paystackProvider } from "./paystack";
import type { PaymentProvider } from "./provider";

/**
 * Per-tenant provider selection (tenants.payment). The secret key never
 * lives in the row: payment.secretRef names the env var holding it
 * (e.g. TENANT_OSU_PAYSTACK_SECRET) until a KMS-backed store lands.
 */
export function providerForTenant(
  tenant: Pick<TenantRecord, "payment">,
): Result<PaymentProvider> {
  const cfg = tenant.payment;
  if (cfg.provider === "paystack") {
    const secret = cfg.secretRef ? process.env[cfg.secretRef] : undefined;
    if (!secret) {
      return err(
        "PAYMENT_NOT_CONFIGURED",
        "Payments are not configured for this property.",
      );
    }
    return ok(paystackProvider(secret));
  }
  if (cfg.provider === "stripe") {
    // Interface-ready; implementation lands with the first Stripe tenant.
    return err(
      "PAYMENT_NOT_IMPLEMENTED",
      "Card payments for this property are coming soon.",
    );
  }
  return err(
    "PAYMENT_NOT_CONFIGURED",
    "Payments are not configured for this property.",
  );
}
