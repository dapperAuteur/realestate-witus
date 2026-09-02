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

Next.js (App Router) · Neon Postgres + Drizzle · Better Auth (product-local; optional
ecosystem OIDC on the branded host only) · Tailwind v4 · Photo Sphere Viewer · Mailgun ·
Cloudinary · Vitest + Playwright · pnpm

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

## Ecosystem SSO ("Sign in with WitUS")

**Only `realestate.witus.online` participates in the WitUS ecosystem. An agency's own domain must
never reach `accounts.witus.online`** — one request from it would both reveal that the ecosystem
exists and tell it that someone visited that agency. That gate is the headline fact here, not the
feature.

[src/lib/witus-sso.ts](src/lib/witus-sso.ts) owns it. `shouldShowWitusSignIn` is a pure function
requiring **all** of: OIDC credentials configured, a resolvable branded host (derived from
`BETTER_AUTH_URL`, never a hardcoded hostname), the request arriving *on* that host, and a tenant
outcome that is not a customer agency. It fails **closed** on every uncertainty, including a failed
tenant lookup: a false negative costs a magic link, a false positive leaks the shared backend to an
agency's buyers. `witusEcosystemEnabled` is an alias of the same binding — the same gate, not a
second copy — and it guards all three crossing surfaces: the button, the silent probe, and sign-out.
Defence in depth beyond it: the IdP registers exactly one redirect URI for slug `realestate`, so an
agency host fails at the IdP with a 400 even if this gate were wrong.

**"Continue as ⟨name⟩".** `/[lang]/sign-in` renders the magic-link form immediately and, in parallel,
asks the IdP's `/api/ecosystem/session` (CORS, credentialed, 4s timeout) whether this browser already
holds a WitUS session; if it answers, the button relabels itself. **A blocked, failed, or timed-out
probe is completely invisible** — no error, no spinner, no layout shift — which is the designed state
under Safari ITP and Firefox Total Cookie Protection, where the IdP's cookie never rides along as a
third-party cookie. The name is display copy from a cross-origin response and **is never a
credential**: identity is established only by the OIDC code flow the click starts, which re-checks
the host gate. `runSilentSsoProbe` takes `fetch` as an argument so
[src/lib/silent-sso.test.ts](src/lib/silent-sso.test.ts) can prove an ineligible host makes **zero**
network calls rather than merely looking as if it would. A one-shot marker (`sessionStorage` +
`?sso=tried`, written *before* the redirect) stops a stale IdP session from looping the visitor.

**Global sign-out.** On the branded host, signing out here signs you out of every WitUS app; on an
agency domain it stays entirely local. **Order is the safety property:** the local session is
destroyed first, then `src/app/[lang]/sign-out-action.ts` redirects
to the IdP's `oauth2/endsession` with `client_id` and a `post_logout_redirect_uri` of
`https://realestate.witus.online/` — trailing slash included, because Better Auth exact-matches it
against the registry, and locale-less because `/` then 307s to `/en` here. An IdP that is unreachable
or refuses the logout still leaves you signed out here.

Both features are dark unless `WITUS_OIDC_CLIENT_ID` and `WITUS_OIDC_CLIENT_SECRET` are set;
`WITUS_OIDC_DISCOVERY_URL` is optional and every IdP URL is derived from it, so
`accounts.witus.online` is named in one place (see `.env.example` and
[src/lib/env.ts](src/lib/env.ts)).

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
