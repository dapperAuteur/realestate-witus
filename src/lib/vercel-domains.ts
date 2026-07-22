import "server-only";
import { env, hasVercelDomains } from "@/lib/env";

// Vercel Domains API wrapper, lifted from witus-learn (the working version
// behind learn.witus.online's domain manager). BAM attaches tenant domains
// from /platform/domains instead of the Vercel dashboard.
//
// SECURITY: VERCEL_DOMAINS_TOKEN is read from env only, sent as a Bearer
// header, and never logged — on failure only Vercel's error MESSAGE surfaces.

const API_BASE = "https://api.vercel.com";

export interface VercelVerificationRecord {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

interface VercelDomainBody {
  name?: string;
  verified?: boolean;
  verification?: VercelVerificationRecord[];
  error?: { code?: string; message?: string };
}

function teamQuery(): string {
  return env.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}`
    : "";
}

async function vercelFetch(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: VercelDomainBody }> {
  const res = await fetch(`${API_BASE}${path}${teamQuery()}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.VERCEL_DOMAINS_TOKEN}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as VercelDomainBody;
  return { status: res.status, body };
}

export interface AttachResult {
  ok: boolean;
  verified?: boolean;
  verification?: VercelVerificationRecord[];
  error?: string;
}

/** Register a domain on the Vercel project. Idempotent: already-attached counts as success. */
export async function attachDomain(host: string): Promise<AttachResult> {
  if (!hasVercelDomains) {
    return { ok: false, error: "Vercel domain automation is not configured." };
  }
  const { status, body } = await vercelFetch(
    `/v10/projects/${env.VERCEL_PROJECT_ID}/domains`,
    { method: "POST", body: JSON.stringify({ name: host }) },
  );
  if (status >= 200 && status < 300) {
    return { ok: true, verified: Boolean(body.verified), verification: body.verification };
  }
  const alreadyAttached =
    status === 409 ||
    /already (exists|in use|assigned|added)/i.test(body.error?.message ?? "");
  if (alreadyAttached) {
    const current = await getDomainStatus(host);
    return { ok: true, verified: current.verified, verification: current.verification };
  }
  return { ok: false, error: body.error?.message ?? `Vercel error (${status})` };
}

export interface StatusResult {
  verified: boolean;
  verification?: VercelVerificationRecord[];
}

/** Ask Vercel to re-check DNS, then read the domain's verification state. */
export async function getDomainStatus(host: string): Promise<StatusResult> {
  if (!hasVercelDomains) return { verified: false };
  await vercelFetch(
    `/v9/projects/${env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(host)}/verify`,
    { method: "POST" },
  ).catch(() => null);
  const { status, body } = await vercelFetch(
    `/v9/projects/${env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(host)}`,
  );
  if (status >= 200 && status < 300) {
    return { verified: Boolean(body.verified), verification: body.verification };
  }
  return { verified: false };
}

/** Best-effort removal; a Vercel failure never blocks un-mapping the DB row. */
export async function detachDomain(host: string): Promise<void> {
  if (!hasVercelDomains) return;
  try {
    await vercelFetch(
      `/v9/projects/${env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(host)}`,
      { method: "DELETE" },
    );
  } catch {
    /* best-effort */
  }
}
