"use server";

import { redirect } from "next/navigation";
import {
  confirmInvoicePaid,
  createInvoice,
  upsertTenantBilling,
  voidInvoice,
} from "@/lib/platform/billing";
import { platformAccess } from "@/lib/platform/guard";
import { writeAudit } from "@/lib/audit";

async function guard(lang: string): Promise<string | null> {
  const access = await platformAccess();
  if (!access.ok) redirect(`/${lang}/sign-in`);
  return access.user?.id ?? null;
}

function backTo(back: string, flag: "ok" | "error", value: string): never {
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${flag}=${encodeURIComponent(value)}`);
}

export async function savePricingAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/platform/billing`);
  await guard(lang);
  const result = await upsertTenantBilling(String(formData.get("tenantId") ?? ""), {
    setupFeeMinor: Number(formData.get("setupFeeMinor") ?? NaN),
    monthlyFeeMinor: Number(formData.get("monthlyFeeMinor") ?? NaN),
    currency: String(formData.get("currency") ?? "").toUpperCase(),
    billingEmail: String(formData.get("billingEmail") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) backTo(back, "error", result.code);
  backTo(back, "ok", "1");
}

export async function createInvoiceAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/platform/billing`);
  await guard(lang);
  const kind = String(formData.get("kind") ?? "custom");
  const tenantId = String(formData.get("tenantId") ?? "");
  const result = await createInvoice(tenantId, {
    kind: (["setup", "monthly", "custom"].includes(kind) ? kind : "custom") as
      | "setup"
      | "monthly"
      | "custom",
    description: String(formData.get("description") ?? ""),
    amountMinor: Number(formData.get("amountMinor") ?? NaN),
    currency: String(formData.get("currency") ?? "").toUpperCase(),
    dueDate: String(formData.get("dueDate") ?? "") || null,
  });
  if (!result.ok) backTo(back, "error", result.code);
  await writeAudit({
    tenantId,
    kind: "billing.invoice.created",
    summary: `Invoice ${result.data.code} created`,
    data: { code: result.data.code },
  });
  backTo(back, "ok", "1");
}

export async function confirmInvoiceAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/platform/billing`);
  const userId = await guard(lang);
  const method = String(formData.get("method") ?? "other");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const result = await confirmInvoicePaid(
    invoiceId,
    userId,
    (["momo", "stripe", "other"].includes(method) ? method : "other") as
      | "momo"
      | "stripe"
      | "other",
  );
  if (!result.ok) backTo(back, "error", result.code);
  await writeAudit({
    actorUserId: userId,
    kind: "billing.invoice.paid",
    summary: "Invoice confirmed paid",
    data: { invoiceId, method },
  });
  backTo(back, "ok", "1");
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const lang = String(formData.get("lang") ?? "en");
  const back = String(formData.get("back") ?? `/${lang}/platform/billing`);
  await guard(lang);
  await voidInvoice(String(formData.get("invoiceId") ?? ""));
  backTo(back, "ok", "1");
}
