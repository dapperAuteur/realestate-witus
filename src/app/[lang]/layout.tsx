import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionBar } from "@/components/session-bar";
import { TenantHeader } from "@/components/hotel/tenant-header";
import Link from "next/link";
import { DEMO_TENANT_SLUG } from "@/lib/demo/seed";
import { hasDemoLogin } from "@/lib/env";
import { getSessionUser } from "@/lib/rbac";
import { brandCssVars } from "@/lib/brand-presets";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { fontPairCssVars } from "@/lib/fonts";
import { tenantMetadata } from "@/lib/seo";
import { resolveTenant } from "@/lib/tenant";

// Tenant chrome: resolves the tenant from the request Host and applies its
// brand preset + font pair as CSS custom properties. Pages below use
// var(--brand-accent); headings opt into var(--font-heading).

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant().catch(() => null);
  // Platform hosts keep the root Stay.WitUS metadata; hotels get their own.
  if (!tenant || tenant.flags.platform) return {};
  return tenantMetadata(tenant);
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const tenant = await resolveTenant().catch(() => null);
  const showDemoRibbon =
    tenant?.slug === DEMO_TENANT_SLUG &&
    hasDemoLogin &&
    !(await getSessionUser().catch(() => null));
  const vars = {
    ...brandCssVars(tenant?.theme.presetKey),
    ...fontPairCssVars(tenant?.theme.fontPairKey),
  };

  return (
    <div
      style={{ ...vars, fontFamily: "var(--font-body, inherit)" }}
      className="min-h-dvh"
    >
      <SessionBar lang={lang} dict={dict} />
      {showDemoRibbon ? (
        <aside
          role="note"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-900 px-4 py-2 text-center text-xs text-white dark:border-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          <span>{dict.demoRibbon.text}</span>
          <Link
            href={`/${lang}/sign-in`}
            className="inline-flex min-h-8 items-center font-semibold underline underline-offset-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {dict.demoRibbon.cta}
          </Link>
        </aside>
      ) : null}
      {tenant && !tenant.flags.platform ? (
        <TenantHeader tenant={tenant} dict={dict} lang={lang} />
      ) : null}
      {children}
    </div>
  );
}
