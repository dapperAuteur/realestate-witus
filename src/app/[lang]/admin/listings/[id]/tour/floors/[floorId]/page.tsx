import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FloorPinEditor } from "@/components/admin/floor-pin-editor";
import { HINT, SECONDARY_BUTTON } from "@/components/admin/listing-form";
import { requireStaffPage } from "@/lib/admin/guard";
import { getDictionary, hasLocale } from "@/lib/dictionaries";
import { canEditListing, findOwnedListing } from "@/lib/listings/admin";
import { tourEditData } from "@/lib/tour/admin";
import { autoArrangeFloorAction } from "../../../../actions";
import { Flash } from "../../../../../flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Floor plan pins" };

export default async function FloorPinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string; floorId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { lang, id, floorId } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const ctx = await requireStaffPage("agent", lang);
  const listing = await findOwnedListing(ctx.tenant.id, id);
  if (!listing || !canEditListing({ role: ctx.role, userId: ctx.user.id }, listing)) notFound();
  const data = await tourEditData(ctx.tenant.id, id);
  const plan = data?.floorPlans.find((p) => p.id === floorId);
  if (!data || !plan || !plan.imageUrl || !plan.width || !plan.height) notFound();
  const sp = await searchParams;
  const f = dict.admin.tour.floor;

  return (
    <div className="flex flex-col gap-6">
      <Flash ok={sp.ok} error={sp.error} dict={dict} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{f.title.replace("{floor}", plan.label)}</h2>
          <p className={HINT}>{f.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={autoArrangeFloorAction}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="floorPlanId" value={plan.id} />
            <button type="submit" className={SECONDARY_BUTTON}>
              {f.autoArrange}
            </button>
          </form>
          <Link href={`/${lang}/admin/listings/${listing.id}/tour#floors`} className={SECONDARY_BUTTON}>
            {dict.admin.tour.scene.backToTour}
          </Link>
        </div>
      </div>
      <FloorPinEditor
        floorPlanId={plan.id}
        plan={{ imageUrl: plan.imageUrl, width: plan.width, height: plan.height, label: plan.label }}
        rooms={data.scenes.map((scene) => ({
          id: scene.id,
          name: scene.name,
          floorPlanId: scene.floorPlanId,
          mapX: scene.mapX,
          mapY: scene.mapY,
        }))}
        labels={{ ...f, saved: dict.admin.tour.scene.saved, planAlt: dict.listing.floorPlan.planAlt }}
      />
    </div>
  );
}
