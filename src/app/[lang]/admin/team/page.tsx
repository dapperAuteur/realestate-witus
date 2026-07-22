import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin/guard";
import { listTeam } from "@/lib/admin/invites";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { inviteStaffAction, revokeInviteAction } from "../actions";
import { Flash } from "../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team" };

const INPUT =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900";

export default async function AdminTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("owner", lang);
  const a = dict.admin.team;
  const sp = await searchParams;
  const team = await listTeam(ctx.tenant.id);
  const self = `/${lang}/admin/team`;

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} dict={dict} />

      <section aria-label={a.members}>
        <h2 className="text-lg font-semibold">{a.members}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {team.members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <span>
                <strong>{m.name ?? m.email}</strong>
                {m.name ? <span className="text-slate-500"> · {m.email}</span> : null}
              </span>
              <span className="text-slate-500">{m.role.replace("_", " ")}</span>
            </li>
          ))}
          {team.members.length === 0 ? (
            <li className="text-sm text-slate-500">{a.noMembers}</li>
          ) : null}
        </ul>
      </section>

      <section aria-label={a.pending} className="mt-8">
        <h2 className="text-lg font-semibold">{a.pending}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {team.pending.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <span>
                <strong>{invite.email}</strong>{" "}
                <span className="text-slate-500">
                  · {invite.role.replace("_", " ")}
                </span>
              </span>
              <form action={revokeInviteAction}>
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="back" value={self} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 font-medium dark:border-slate-700"
                >
                  {a.revoke}
                  <span className="sr-only"> {invite.email}</span>
                </button>
              </form>
            </li>
          ))}
          {team.pending.length === 0 ? (
            <li className="text-sm text-slate-500">{a.noPending}</li>
          ) : null}
        </ul>
      </section>

      <section
        aria-label={a.inviteTitle}
        className="mt-8 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
      >
        <h2 className="text-lg font-semibold">{a.inviteTitle}</h2>
        <form action={inviteStaffAction} className="mt-4 flex flex-wrap items-end gap-4">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="back" value={self} />
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-email" className="text-sm font-medium">
              {a.emailLabel}
            </label>
            <input id="invite-email" name="email" type="email" required className={INPUT} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-role" className="text-sm font-medium">
              {a.roleField}
            </label>
            <select id="invite-role" name="role" defaultValue="front_desk" className={INPUT}>
              <option value="front_desk">{a.roles.front_desk}</option>
              <option value="manager">{a.roles.manager}</option>
              <option value="owner">{a.roles.owner}</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
          >
            {a.send}
          </button>
        </form>
      </section>
    </div>
  );
}
