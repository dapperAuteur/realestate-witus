import type { hotelSettings } from "@/db/schema";
import type { Dictionary } from "@/lib/dictionaries";
import type { TemplateDef } from "@/lib/templates";
import { SectionShell } from "./section-shell";

type SettingsRow = typeof hotelSettings.$inferSelect;

const ACTION_CLASSES =
  "inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:border-slate-700";

export function ContactSection({
  settings,
  dict,
  tpl,
}: {
  settings: SettingsRow | undefined;
  dict: Dictionary;
  tpl: TemplateDef;
}) {
  if (!settings) return null;
  const s = dict.sections;

  return (
    <SectionShell tpl={tpl} id="contact" title={s.contactTitle}>
      {settings.address ? (
        <address className="not-italic leading-relaxed text-slate-600 dark:text-slate-400">
          {settings.address}
        </address>
      ) : null}
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {s.contactCheckIn} {settings.checkinTime} · {s.contactCheckOut}{" "}
        {settings.checkoutTime}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {settings.whatsappE164 ? (
          <a
            href={`https://wa.me/${settings.whatsappE164.replace(/^\+/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className={ACTION_CLASSES}
          >
            {s.contactWhatsApp}
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : null}
        {settings.phone ? (
          <a href={`tel:${settings.phone}`} className={ACTION_CLASSES}>
            {s.contactCall}
          </a>
        ) : null}
        {settings.email ? (
          <a href={`mailto:${settings.email}`} className={ACTION_CLASSES}>
            {s.contactEmail}
          </a>
        ) : null}
      </div>
    </SectionShell>
  );
}
