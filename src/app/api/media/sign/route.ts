import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/admin/guard";
import { hasCloudinary, signUploadRequest } from "@/lib/media/cloudinary";
import { err, ok } from "@/lib/result";

// Staff-only upload signing. The signature authorizes ONE tenant-foldered
// upload; the API secret never leaves the server. 503 until task 05
// (Cloudinary account) supplies env — the content editor explains that.

export async function POST() {
  const gate = await getStaffContext("front_desk");
  if (!gate.ok) {
    return NextResponse.json(err("FORBIDDEN", "Staff only."), { status: 403 });
  }
  if (!hasCloudinary()) {
    return NextResponse.json(
      err("MEDIA_NOT_CONFIGURED", "Media uploads are not configured yet."),
      { status: 503 },
    );
  }
  const signed = signUploadRequest(gate.ctx.tenant.id);
  return NextResponse.json(ok(signed));
}
