import { createHmac, timingSafeEqual } from "node:crypto";
import { err, ok } from "@/lib/result";
import type {
  InitPaymentInput,
  InitPaymentResult,
  PaymentProvider,
  WebhookEvent,
} from "./provider";

// Paystack: Ghana's rail (MTN MoMo, Telecel Cash, AirtelTigo Money, cards),
// GHS per FX Act 723. Webhooks are HMAC-SHA512 of the raw body with the
// account's secret key in x-paystack-signature (no timestamp in the scheme,
// so no skew check is possible — idempotency via payments.provider_ref
// carries replay safety instead).

const API_BASE = "https://api.paystack.co";

interface PaystackInitResponse {
  status?: boolean;
  data?: { authorization_url?: string; reference?: string };
}

interface PaystackEventPayload {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
  };
}

export function paystackProvider(secretKey: string): PaymentProvider {
  return {
    key: "paystack",

    async initializePayment(input: InitPaymentInput) {
      const res = await fetch(`${API_BASE}/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountMinor,
          currency: input.currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
      });
      if (!res.ok) {
        // Never surface provider response bodies to guests (may echo inputs).
        return err(
          "PROVIDER_ERROR",
          `Payment could not be started (upstream ${res.status}).`,
        );
      }
      const json = (await res.json().catch(() => null)) as PaystackInitResponse | null;
      const checkoutUrl = json?.data?.authorization_url;
      if (!json?.status || !checkoutUrl) {
        return err("PROVIDER_ERROR", "Payment could not be started.");
      }
      const result: InitPaymentResult = {
        checkoutUrl,
        providerRef: json.data?.reference ?? input.reference,
      };
      return ok(result);
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!signature) return false;
      const expected = createHmac("sha512", secretKey)
        .update(rawBody)
        .digest("hex");
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(signature, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    },

    parseWebhookEvent(rawBody): WebhookEvent {
      let payload: PaystackEventPayload;
      try {
        payload = JSON.parse(rawBody) as PaystackEventPayload;
      } catch {
        return { kind: "ignored" };
      }
      const reference = payload.data?.reference;
      if (!reference) return { kind: "ignored" };

      if (payload.event === "charge.success") {
        const amount = payload.data?.amount;
        const currency = payload.data?.currency;
        if (typeof amount !== "number" || !currency) return { kind: "ignored" };
        return {
          kind: "payment_success",
          providerRef: reference,
          amountMinor: amount,
          currency,
          channel: payload.data?.channel,
          raw: payload,
        };
      }
      if (payload.event === "charge.failed") {
        return { kind: "payment_failed", providerRef: reference, raw: payload };
      }
      return { kind: "ignored" };
    },
  };
}
