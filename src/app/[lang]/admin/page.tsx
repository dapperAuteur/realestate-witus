import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelSettings } from "@/db/schema";
import { requireStaffPage } from "@/lib/admin/guard";
import { getTodayBoard, localToday, type TodayReservation } from "@/lib/admin/today";
import { getDictionary, hasLocale } from "@/lib/dictionaries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

function Board({ title, rows, empty }: { title: string; rows: TodayReservation[]; empty: string }) {
  return (
    <section aria-label={title} className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="font-medium">{r.guestName}</span>
              <span className="text-slate-500">
                {r.roomTypeName} · {r.code} · {r.paymentStatus.replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminTodayPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const gate = { ctx: await requireStaffPage("front_desk", lang) };
  const a = dict.admin.today;

  const [settings] = await db()
    .select({ timezone: hotelSettings.timezone })
    .from(hotelSettings)
    .where(eq(hotelSettings.tenantId, gate.ctx.tenant.id))
    .limit(1);
  const today = localToday(settings?.timezone ?? "Africa/Accra");
  const board = await getTodayBoard(gate.ctx.tenant.id, today);
  if (!board.ok) throw new Error(board.error);
  const b = board.data;

  const stats = [
    { label: a.inHouse, value: b.inHouseCount },
    { label: a.awaitingApproval, value: b.awaitingApprovalCount },
    { label: a.pendingPayment, value: b.pendingPaymentCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <dt className="text-sm text-slate-500">{s.label}</dt>
            <dd className="text-3xl font-bold" style={{ color: "var(--brand-accent)" }}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 sm:grid-cols-2">
        <Board title={a.arrivals} rows={b.arrivals} empty={a.nobody} />
        <Board title={a.departures} rows={b.departures} empty={a.nobody} />
      </div>
    </div>
  );
}
