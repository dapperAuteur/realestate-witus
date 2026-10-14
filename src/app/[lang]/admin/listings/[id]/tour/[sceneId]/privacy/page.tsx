import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HINT } from "@/components/admin/listing-form";
import { PrivacyEditor } from "@/components/admin/privacy-editor";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { env } from "@/lib/env";
import { canEditListing, findOwnedListing } from "@/lib/listings/admin";
import { tourEditData } from "@/lib/tour/admin";
import { patchLogos, privacyEditData } from "@/lib/tour/privacy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hide people and gear" };

export default async function PrivacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string; sceneId: string }>;
  searchParams: Promise<{ moment?: string }>;
}) {
  const { lang, id, sceneId } = await params;
  const momentId = (await searchParams).moment ?? null;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("agent", lang);
  const listing = await findOwnedListing(ctx.tenant.id, id);
  if (!listing || !canEditListing({ role: ctx.role, userId: ctx.user.id }, listing)) notFound();
  const data = await privacyEditData(ctx.tenant.id, { sceneId, momentId });
  if (!data || data.listingId !== listing.id) notFound();
  const momentLabel = momentId
    ? (await tourEditData(ctx.tenant.id, listing.id))?.moments.find((m) => m.id === momentId)?.label
    : null;
  const p = dict.admin.tour.privacy;
  const logos = await patchLogos(ctx.tenant.id);
  const back = `/${lang}/admin/listings/${listing.id}/tour/${sceneId}`;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">
        {p.title.replace("{name}", momentLabel ? `${data.sceneName} (${momentLabel})` : data.sceneName)}
      </h2>
      <p className={`${HINT} max-w-2xl`}>{p.intro}</p>
      {env.CLOUDINARY_CLOUD_NAME ? (
        <PrivacyEditor
          sceneId={sceneId}
          momentId={momentId}
          currentMediaId={data.currentMediaId}
          source={data.source}
          previewBase={`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`}
          initialRecipe={data.recipe}
          edited={data.edited}
          backHref={back}
          labels={p}
          logos={logos}
          uploadLabels={{ ...dict.admin.listings.upload, choose: p.uploadLogo, hint: p.logoHint }}
        />
      ) : (
        <p role="alert">{dict.admin.listings.upload.notConfigured}</p>
      )}
    </div>
  );
}
