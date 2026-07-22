import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getStaffContext } from "@/lib/admin/guard";
import { err, ok } from "@/lib/result";

// Second leg of the signed-upload flow: after the browser uploads straight to
// Cloudinary, it registers the asset here (a11y rule: meaningful alt text or
// explicitly empty, never a filename). Tenant folder is re-checked so a
// signature for agency A cannot register into agency B.

export async function POST(request: Request) {
  const gate = await getStaffContext("agent");
  if (!gate.ok) {
    return NextResponse.json(err("FORBIDDEN", "Staff only."), { status: 403 });
  }
  const tenantId = gate.ctx.tenant.id;

  const body = (await request.json().catch(() => null)) as {
    publicId?: string;
    width?: number;
    height?: number;
    bytes?: number;
    altText?: string;
  } | null;
  const publicId = body?.publicId ?? "";
  if (!publicId.startsWith(`realestate-witus/${tenantId}/`)) {
    return NextResponse.json(
      err("WRONG_FOLDER", "Upload does not belong to this tenant."),
      { status: 400 },
    );
  }

  const [asset] = await db()
    .insert(mediaAssets)
    .values({
      tenantId,
      cloudinaryPublicId: publicId,
      kind: "photo",
      width: body?.width ?? null,
      height: body?.height ?? null,
      bytes: body?.bytes ?? null,
      altText: (body?.altText ?? "").trim(),
      status: "ready",
      createdBy: gate.ctx.user.id,
    })
    .returning({ id: mediaAssets.id });

  return NextResponse.json(ok({ mediaId: asset.id }));
}
