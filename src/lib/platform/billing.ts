import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { pgErrorCode } from "@/lib/booking/holds";
import { db } from "@/db";
import { hotelSettings, platformInvoices, tenantBilling, tenants } from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";
import { err, ok, type Result } from "@/lib/result";

// Platform billing (workstream 12): the hotel owner pays BAM. MoMo is
// claim-then-confirm — the invoice code IS the transfer reference; the payer
// taps "I've sent it"; BAM confirms in /platform/billing. Nothing here moves
// money; it records agreements and receipts.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function invoiceCode(): string {
  let suffix = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `INV-${new Date().getUTCFullYear()}-${suffix}`;
}

export async function getTenantBilling(tenantId: string) {
  const [row] = await db()
    .select()
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

export async function upsertTenantBilling(
  tenantId: string,
  input: {
    setupFeeMinor: number;
    monthlyFeeMinor: number;
    currency: string;
    billingEmail: string;
    notes: string;
  },
): Promise<Result<{ saved: boolean }>> {
  if (
    !Number.isInteger(input.setupFeeMinor) ||
    input.setupFeeMinor < 0 ||
    !Number.isInteger(input.monthlyFeeMinor) ||
    input.monthlyFeeMinor < 0
  ) {
    return err("INVALID_AMOUNT", "Fees must be zero or positive minor units.");
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return err("INVALID_CURRENCY", "Currency is a 3-letter code like USD or GHS.");
  }
  const values = {
    setupFeeMinor: input.setupFeeMinor,
    monthlyFeeMinor: input.monthlyFeeMinor,
    currency: input.currency,
    billingEmail: input.billingEmail.trim() || null,
    notes: input.notes.trim() || null,
    updatedAt: new Date(),
  };
  await db()
    .insert(tenantBilling)
    .values({ tenantId, ...values })
    .onConflictDoUpdate({ target: tenantBilling.tenantId, set: values });
  return ok({ saved: true });
}

export async function createInvoice(
  tenantId: string,
  input: {
    kind: "setup" | "monthly" | "custom";
    description: string;
    amountMinor: number;
    currency: string;
    dueDate: string | null;
  },
): Promise<Result<{ id: string; code: string }>> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return err("INVALID_AMOUNT", "Amount must be positive minor units.");
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return err("INVALID_CURRENCY", "Currency is a 3-letter code like USD or GHS.");
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const code = invoiceCode();
    try {
      const [row] = await db()
        .insert(platformInvoices)
        .values({
          tenantId,
          code,
          kind: input.kind,
          description: input.description.trim() || null,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "sent",
          sentAt: new Date(),
          dueDate: input.dueDate,
        })
        .returning({ id: platformInvoices.id, code: platformInvoices.code });
      await notifyInvoice(tenantId, row.code, input.amountMinor, input.currency);
      return ok(row);
    } catch (error) {
      if (pgErrorCode(error) !== "23505" || attempt === 3) throw error;
    }
  }
  return err("GENERIC", "Could not allocate an invoice code.");
}

/** Best-effort heads-up with the MoMo instructions; the invoice stands regardless. */
async function notifyInvoice(
  tenantId: string,
  code: string,
  amountMinor: number,
  currency: string,
): Promise<void> {
  try {
    const [billing] = await db()
      .select({ email: tenantBilling.billingEmail })
      .from(tenantBilling)
      .where(eq(tenantBilling.tenantId, tenantId))
      .limit(1);
    const [settings] = billing?.email
      ? [null]
      : await db()
          .select({ email: hotelSettings.email })
          .from(hotelSettings)
          .where(eq(hotelSettings.tenantId, tenantId))
          .limit(1);
    const to = billing?.email ?? settings?.email;
    if (!to) return;
    const [tenant] = await db()
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const amount = `${currency} ${(amountMinor / 100).toFixed(2)}`;
    const momo =
      env.PLATFORM_MOMO_NUMBER && env.PLATFORM_MOMO_NAME
        ? [
            "",
            `Pay by MTN MoMo: send ${amount} to ${env.PLATFORM_MOMO_NUMBER} (${env.PLATFORM_MOMO_NAME}).`,
            `Use ${code} as the reference, then open your dashboard's Billing tab and tap "I've sent it".`,
          ]
        : [];
    await sendEmail({
      to,
      subject: `Stay.WitUS invoice ${code} — ${amount}`,
      text: [
        `Invoice ${code} for ${tenant?.name ?? "your property"}: ${amount}.`,
        ...momo,
        "",
        "Questions? Reply to this email.",
      ].join("\n"),
    });
  } catch {
    /* best-effort */
  }
}

export async function listInvoicesForTenant(tenantId: string) {
  return db()
    .select()
    .from(platformInvoices)
    .where(eq(platformInvoices.tenantId, tenantId))
    .orderBy(desc(platformInvoices.createdAt));
}

/** Owner-side: "I've sent it" on an open invoice. Idempotent. */
export async function claimMomoInvoice(
  tenantId: string,
  invoiceId: string,
): Promise<Result<{ claimed: boolean }>> {
  const rows = await db()
    .update(platformInvoices)
    .set({ momoClaimedAt: new Date(), method: "momo", updatedAt: new Date() })
    .where(
      and(
        eq(platformInvoices.id, invoiceId),
        eq(platformInvoices.tenantId, tenantId),
        eq(platformInvoices.status, "sent"),
        isNull(platformInvoices.momoClaimedAt),
      ),
    )
    .returning({ id: platformInvoices.id });
  return ok({ claimed: rows.length > 0 });
}

/** Platform-side queue: claimed transfers awaiting BAM's confirmation. */
export async function pendingMomoQueue() {
  return db()
    .select({
      invoice: platformInvoices,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(platformInvoices)
    .innerJoin(tenants, eq(platformInvoices.tenantId, tenants.id))
    .where(
      and(
        eq(platformInvoices.status, "sent"),
        isNotNull(platformInvoices.momoClaimedAt),
      ),
    )
    .orderBy(desc(platformInvoices.momoClaimedAt));
}

export async function confirmInvoicePaid(
  invoiceId: string,
  confirmedBy: string | null,
  method: "momo" | "stripe" | "other",
): Promise<Result<{ paid: boolean }>> {
  const rows = await db()
    .update(platformInvoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      method,
      // Null during the pre-owner bootstrap window (FK to users.id).
      confirmedBy: confirmedBy ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(platformInvoices.id, invoiceId), ne(platformInvoices.status, "paid")),
    )
    .returning({ id: platformInvoices.id });
  if (rows.length === 0) return err("NOT_FOUND", "Invoice not found or already paid.");
  return ok({ paid: true });
}

export async function voidInvoice(invoiceId: string): Promise<Result<{ voided: boolean }>> {
  const rows = await db()
    .update(platformInvoices)
    .set({ status: "void", updatedAt: new Date() })
    .where(
      and(
        eq(platformInvoices.id, invoiceId),
        sql`${platformInvoices.status} in ('draft', 'sent', 'overdue')`,
      ),
    )
    .returning({ id: platformInvoices.id });
  return ok({ voided: rows.length > 0 });
}
