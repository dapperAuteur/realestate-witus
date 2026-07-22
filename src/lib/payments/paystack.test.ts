import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paystackProvider } from "./paystack";

const SECRET = "sk_test_unit-vector";
const provider = paystackProvider(SECRET);

function sign(body: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts the correct HMAC-SHA512 of the raw body", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(provider.verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it("rejects a missing, truncated, or wrong-key signature", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(provider.verifyWebhookSignature(body, null)).toBe(false);
    expect(provider.verifyWebhookSignature(body, sign(body).slice(0, 64))).toBe(
      false,
    );
    expect(
      provider.verifyWebhookSignature(body, sign(body, "sk_test_other")),
    ).toBe(false);
  });

  it("rejects when the body was altered after signing", () => {
    const body = JSON.stringify({ event: "charge.success", data: { amount: 100 } });
    const tampered = body.replace("100", "1");
    expect(provider.verifyWebhookSignature(tampered, sign(body))).toBe(false);
  });
});

describe("parseWebhookEvent", () => {
  it("maps charge.success with amount, currency, and channel", () => {
    const event = provider.parseWebhookEvent(
      JSON.stringify({
        event: "charge.success",
        data: {
          reference: "swu-abc",
          amount: 22_350,
          currency: "GHS",
          channel: "mobile_money",
        },
      }),
    );
    expect(event).toMatchObject({
      kind: "payment_success",
      providerRef: "swu-abc",
      amountMinor: 22_350,
      currency: "GHS",
      channel: "mobile_money",
    });
  });

  it("maps charge.failed", () => {
    const event = provider.parseWebhookEvent(
      JSON.stringify({ event: "charge.failed", data: { reference: "swu-abc" } }),
    );
    expect(event).toMatchObject({ kind: "payment_failed", providerRef: "swu-abc" });
  });

  it("ignores other events, missing references, and malformed JSON", () => {
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({ event: "transfer.success", data: { reference: "x" } }),
      ).kind,
    ).toBe("ignored");
    expect(
      provider.parseWebhookEvent(JSON.stringify({ event: "charge.success", data: {} }))
        .kind,
    ).toBe("ignored");
    expect(provider.parseWebhookEvent("not json").kind).toBe("ignored");
  });
});
