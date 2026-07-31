# RealEstate.WitUS

Virtual tours for commercial and residential real estate that's for sale. Professionally
captured 360° tours published as fast, branded listing pages — and **embeddable**: every
listing ships a copy-paste iframe snippet agents drop into their own websites, with view
analytics included.

Self-hosted tour engine (Photo Sphere Viewer) so tours are owned, not rented; an optional
RealSee dollhouse layer covers listings that warrant full 3D. Service-led: we capture and
build; agents, brokerages, and developers buy listings.

> **Status:** the platform spine is in place and the seed template's hotel domain is
> gone (workstream 1 complete): runtime tenancy, Better Auth magic links, platform
> billing, /platform admin with the domain manager, Mailgun, Cloudinary, support, audit
> log, and the test rig. Listings, tours, and embeds are next — see HANDOFF.md.

## Stack

Next.js (App Router) · Neon Postgres + Drizzle · Better Auth (product-local) ·
Tailwind v4 · Photo Sphere Viewer · Mailgun · Cloudinary · Vitest + Playwright · pnpm

## Develop

```bash
pnpm install
cp .env.example .env.local   # fill values; never commit env files
pnpm db:migrate              # needs STORAGE_DATABASE_URL (or DATABASE_URL)
pnpm dev
```

## Scripts

| Script | What |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm typecheck` / `test` | tsc / Vitest (Neon integration tests skip without a DB URL) |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations (prod runs are BAM's, via user-task) |

## Error monitoring (Better Stack)

Crash reporting runs through the Sentry SDK, pointed at a Better Stack source (Better Stack
ingests over the Sentry protocol). It is **off until a DSN exists**: with `SENTRY_DSN` and
`NEXT_PUBLIC_SENTRY_DSN` unset, no runtime initializes the SDK and the app behaves exactly as it
did before. Set them in Vercel to switch it on (see `.env.example` and user-task 06).

- Server + edge init: `sentry.server.config.ts` / `sentry.edge.config.ts`, loaded by
  `src/instrumentation.ts`. Browser init: `src/instrumentation-client.ts`.
- Tracing and session replay are sampled at **0**; errors only.
- `src/lib/sentry-scrub.ts` is the `beforeSend` scrub: it drops the user identity, cookies, and
  auth headers, and redacts emails, magic-link / invite tokens, and labelled secrets out of
  messages and URLs before anything leaves the app.
- Server errors are tagged `tenant.host` (the request Host, which is how tenants resolve), so a
  crash is attributable to a brand without a DB lookup and without any PII.

## Uptime checks (`/api/health`)

**Point uptime monitors at `/api/health`, not at `/`.** The homepage can answer 200 from cache
while Postgres is unreachable, so a green check on `/` proves nothing. `/api/health` runs a real
`select 1` against the database on every request, capped at a 4 second timeout.

| Result | Status | Body |
|---|---|---|
| Database answered | `200` | `{"ok":true,"checks":{"db":"ok"}}` |
| Database unreachable, timed out, or `DATABASE_URL` unset | `503` | `{"ok":false,"error":"database_unreachable"}` |

`HEAD` is supported too and carries the same verdict in the status code with an empty body.

- **Public and unauthenticated**, and it leaks nothing: no version, env values, counts, tenant
  data, or user data. The error string is a fixed literal, never the driver's message (a Neon
  connection failure stringifies with the full `postgres://user:pass@host` URL), in the response
  **and** in the logs.
- **Tenant-agnostic by construction:** `GET` takes no `Request`, so it cannot read the Host header
  or reach the tenant resolver. It reports whether the app and database are alive, never whether a
  particular brand exists, so an unknown host or a domain mid-DNS-cutover cannot read as an outage.
- **Never cached:** `force-dynamic`, `revalidate = 0`, and `Cache-Control: no-store` on every
  response, so a monitor never grades a stale body.
- Playwright's `webServer` readiness probe also uses this URL, so `pnpm test:e2e` now waits for a
  live database rather than for the process to merely accept connections.

Key invariants: [CLAUDE.md](CLAUDE.md). Full context + plan: [HANDOFF.md](HANDOFF.md).
# realestate-witus
