import type { Result } from "@/lib/result";

// Guest→hotel payment rail behind one interface (CLAUDE.md invariant).
// Paystack ships first (Ghana, GHS); Stripe implements the same surface for
// card-country tenants. Platform billing (owner→BAM) is a separate system.

export interface InitPaymentInput {
  /** Minor units (pesewas for GHS). */
  amountMinor: number;
  currency: string;
  /** Guest email — providers require it for receipts. */
  email: string;
  /** Our unique reference; becomes payments.provider_ref (webhook idempotency key). */
  reference: string;
  /** Where the provider sends the guest after paying. */
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface InitPaymentResult {
  /** Provider-hosted checkout page to redirect the guest to. */
  checkoutUrl: string;
  providerRef: string;
}

export type WebhookEvent =
  | {
      kind: "payment_success";
      providerRef: string;
      amountMinor: number;
      currency: string;
      /** momo | card | bank, as reported by the provider. */
      channel?: string;
      raw: unknown;
    }
  | { kind: "payment_failed"; providerRef: string; raw: unknown }
  | { kind: "ignored" };

export interface PaymentProvider {
  readonly key: "paystack" | "stripe";
  initializePayment(input: InitPaymentInput): Promise<Result<InitPaymentResult>>;
  /** Constant-time verification of the raw request body against its signature header. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  /** Never throws: malformed or irrelevant payloads come back as "ignored". */
  parseWebhookEvent(rawBody: string): WebhookEvent;
}
