import { describe, expect, it } from "vitest";
import { cancellationPolicyText, type PolicyStrings } from "./policy";

const S: PolicyStrings = {
  freeUntil: "Free cancellation until {days} days before check-in.",
  freeAlways: "Free cancellation any time before check-in.",
  penaltyAfter: "Later cancellations owe {percent}% of the stay.",
  nonRefundable: "Bookings are non-refundable once confirmed.",
};

describe("cancellationPolicyText", () => {
  it("renders nothing when no policy is set (never invents one)", () => {
    expect(cancellationPolicyText(null, S)).toBeNull();
    expect(cancellationPolicyText({}, S)).toBeNull();
  });

  it("renders the standard free-until + penalty combination", () => {
    expect(
      cancellationPolicyText({ freeUntilDays: 3, penaltyPercent: 50 }, S),
    ).toBe(
      "Free cancellation until 3 days before check-in. Later cancellations owe 50% of the stay.",
    );
  });

  it("renders free-until alone and penalty alone", () => {
    expect(cancellationPolicyText({ freeUntilDays: 7 }, S)).toBe(
      "Free cancellation until 7 days before check-in.",
    );
    expect(cancellationPolicyText({ penaltyPercent: 30 }, S)).toBe(
      "Free cancellation any time before check-in. Later cancellations owe 30% of the stay.",
    );
  });

  it("collapses 100% penalty with no free window to non-refundable", () => {
    expect(cancellationPolicyText({ penaltyPercent: 100 }, S)).toBe(
      S.nonRefundable,
    );
    expect(
      cancellationPolicyText({ freeUntilDays: 0, penaltyPercent: 100 }, S),
    ).toBe(S.nonRefundable);
    // But 100% AFTER a free window is a normal two-part sentence.
    expect(
      cancellationPolicyText({ freeUntilDays: 5, penaltyPercent: 100 }, S),
    ).toBe(
      "Free cancellation until 5 days before check-in. Later cancellations owe 100% of the stay.",
    );
  });
});
