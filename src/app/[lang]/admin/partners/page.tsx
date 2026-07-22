import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { requireStaffPage } from "@/lib/admin/guard";
import { listPartnersAdmin } from "@/lib/partners";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { issueEditLinkAction, partnerStatusAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partners" };

const BUTTON =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

export default async function AdminPartnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string; link?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("manager", lang);
  const a = dict.admin.partners;
  const sp = await searchParams;

  const rows = await listPartnersAdmin(ctx.tenant.id);
  const host = (await headers()).get("host") ?? "";
  const applyUrl = `https://${host}/${lang}/partners/apply`;

  return (
    <div>
      <Flash ok={sp.link ? undefined : sp.ok} error={sp.error} dict={dict} />
      {sp.link ? (
        <div
          role="status"
          className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
        >
          <p>{a.linkIssued}</p>
          <CopyButton value={sp.link} label={a.copyLink} />
        </div>
      ) : null}

      <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">{a.intro}</p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {a.applyUrlHint} <CopyButton value={applyUrl} label={a.applyUrlHint} />
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{a.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {rows.map((partner) => (
            <li
              key={partner.id}
              className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {partner.name}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {dict.sections.partnerCategories[partner.category]}
                  </span>
                </h2>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                    partner.status === "applied"
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                      : partner.status === "approved"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {a.statuses[partner.status]}
                </span>
              </div>
              {partner.blurb ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {partner.blurb}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                {[partner.whatsappE164, partner.phone, partner.email, partner.priceNote, partner.coverageNote]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {partner.status !== "approved" ? (
                  <form action={partnerStatusAction}>
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="partnerId" value={partner.id} />
                    <input type="hidden" name="statusAction" value="approve" />
                    <button type="submit" className={BUTTON}>
                      {partner.status === "applied" ? a.approve : a.restore}
                      <span className="sr-only"> {partner.name}</span>
                    </button>
                  </form>
                ) : null}
                {partner.status === "approved" ? (
                  <>
                    <form action={partnerStatusAction}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="partnerId" value={partner.id} />
                      <input type="hidden" name="statusAction" value="suspend" />
                      <button type="submit" className={BUTTON}>
                        {a.suspend}
                        <span className="sr-only"> {partner.name}</span>
                      </button>
                    </form>
                    <form action={issueEditLinkAction}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="partnerId" value={partner.id} />
                      <button type="submit" className={BUTTON}>
                        {a.sendLink}
                        <span className="sr-only"> {partner.name}</span>
                      </button>
                    </form>
                  </>
                ) : null}
                {partner.status !== "archived" ? (
                  <form action={partnerStatusAction}>
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="partnerId" value={partner.id} />
                    <input type="hidden" name="statusAction" value="archive" />
                    <button type="submit" className={BUTTON}>
                      {a.archive}
                      <span className="sr-only"> {partner.name}</span>
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
