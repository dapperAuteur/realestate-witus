import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

// Promo codes: validation + discount math + race-safe redemption. The
// discount applies to the stay TOTAL; the deposit percent then applies to
// the discounted total, so "30% deposit" stays true after a promo.

/** Pure discount math, unit-tested. Never returns more than the total. */
export function computeDiscountMinor(
  kind: "percent" | "fixed",
  value: number,
  totalMinor: number,
): number {
  if (totalMinor <= 0 || value <= 0) return 0;
  const raw =
    kind === "percent" ? Math.round((totalMinor * value) / 100) : value;
  return Math.min(raw, totalMinor);
}

export interface AppliedPromo {
  promoId: string;
  code: string;
  discountMinor: number;
}

/**
 * Looks up a live code and prices the discount. Read-only — redemption is a
 * separate conditional UPDATE inside the confirm transaction. One generic
 * error code: guests never learn WHY a code failed (expired vs exhausted vs
 * wrong room leaks campaign mechanics).
 */
export async function applyPromoCode(args: {
  tenantId: string;
  code: string;
  roomTypeId: string;
  checkIn: string;
  totalMinor: number;
}): Promise<Result<AppliedPromo>> {
  const code = args.code.trim();
  if (!code) return err("PROMO_INVALID", "That code is not valid for this stay.");

  const [promo] = await db()
    .select()
    .from(promoCodes)
    .where(
      and(eq(promoCodes.tenantId, args.tenantId), eq(promoCodes.code, code)),
    )
    .limit(1);

  const today = args.checkIn; // validity keyed to the stay being booked
  const valid =
    promo &&
    promo.isActive &&
    (!promo.roomTypeId || promo.roomTypeId === args.roomTypeId) &&
    (!promo.startsOn || promo.startsOn <= today) &&
    (!promo.endsOn || promo.endsOn >= today) &&
    (promo.maxRedemptions == null ||
      promo.redemptionCount < promo.maxRedemptions);
  if (!valid) {
    return err("PROMO_INVALID", "That code is not valid for this stay.");
  }

  const discountMinor = computeDiscountMinor(
    promo.kind,
    promo.value,
    args.totalMinor,
  );
  if (discountMinor <= 0) {
    return err("PROMO_INVALID", "That code is not valid for this stay.");
  }
  return ok({ promoId: promo.id, code: promo.code, discountMinor });
}

/** Race-safe redemption inside the confirm tx: the guard rides the UPDATE. */
export async function redeemPromo(tx: Tx, promoId: string): Promise<boolean> {
  const rows = await tx
    .update(promoCodes)
    .set({ redemptionCount: sql`${promoCodes.redemptionCount} + 1` })
    .where(
      and(
        eq(promoCodes.id, promoId),
        eq(promoCodes.isActive, true),
        or(
          isNull(promoCodes.maxRedemptions),
          sql`${promoCodes.redemptionCount} < ${promoCodes.maxRedemptions}`,
        ),
      ),
    )
    .returning({ id: promoCodes.id });
  return rows.length > 0;
}
