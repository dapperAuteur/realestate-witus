import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HotelHome } from "@/components/hotel/hotel-home";
import { PlatformLanding } from "@/components/platform-landing";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { getGlobalSetting, PROMO_BANNER_KEY } from "@/lib/platform/settings";
import { isPlatformHost } from "@/lib/platform-host";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Tenant home. Four states:
//  1. Platform host (stay.witus.online, previews, localhost) or a tenant
//     flagged platform -> the Stay.WitUS product landing (DB-free path so the
//     domain works before seeding)
//  2. No tenant for this host  -> setup notice
//  3. Tenant flagged comingSoon -> launch placeholder
//  4. Live tenant              -> hotel landing (booking widget lands with the
//     booking workstream; this shell renders identity + booking entry point)

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const tenant = await resolveTenant().catch(() => null);

  if (tenant?.flags.platform || (!tenant && isPlatformHost((await headers()).get("host")))) {
    const promoBanner = await getGlobalSetting(PROMO_BANNER_KEY).catch(() => null);
    return <PlatformLanding dict={dict} lang={lang} promoBanner={promoBanner} />;
  }

  if (!tenant) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold">{dict.setup.title}</h1>
        <p className="text-slate-600 dark:text-slate-400">{dict.setup.body}</p>
      </main>
    );
  }

  if (tenant.flags.comingSoon) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-3xl font-bold">{tenant.theme.name ?? tenant.name}</h1>
        <p className="text-lg font-medium" style={{ color: "var(--brand-accent)" }}>
          {dict.home.comingSoon}
        </p>
        <p className="text-slate-600 dark:text-slate-400">{dict.home.comingSoonBody}</p>
      </main>
    );
  }

  return <HotelHome tenant={tenant} dict={dict} lang={lang} />;
}
