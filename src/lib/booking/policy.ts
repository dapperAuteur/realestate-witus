// Cancellation policy → one honest guest-facing sentence (research A1).
// Pure; dictionary supplies the phrase fragments so es slots in later.

export interface CancellationPolicy {
  freeUntilDays?: number;
  penaltyPercent?: number;
}

export interface PolicyStrings {
  freeUntil: string; // "Free cancellation until {days} days before check-in."
  freeAlways: string; // "Free cancellation any time before check-in."
  penaltyAfter: string; // "Later cancellations owe {percent}% of the stay."
  nonRefundable: string; // "Bookings are non-refundable once confirmed."
}

export function cancellationPolicyText(
  policy: CancellationPolicy | null | undefined,
  s: PolicyStrings,
): string | null {
  if (!policy || (policy.freeUntilDays == null && policy.penaltyPercent == null)) {
    return null; // No policy set: show nothing rather than invent one.
  }
  const parts: string[] = [];
  const days = policy.freeUntilDays;
  const penalty = policy.penaltyPercent;

  if (days != null && days > 0) {
    parts.push(s.freeUntil.replace("{days}", String(days)));
  } else if (penalty != null && penalty < 100 && days == null) {
    parts.push(s.freeAlways);
  }

  if (penalty != null && penalty > 0) {
    if (penalty >= 100 && (days == null || days === 0)) {
      return s.nonRefundable;
    }
    parts.push(s.penaltyAfter.replace("{percent}", String(penalty)));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
