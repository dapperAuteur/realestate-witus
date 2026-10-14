# HANDOFF — RealEstate.WitUS project context

*Created 2026-07-16 at project kickoff; updated 2026-07-21 when the template strip landed. Purpose: let a Claude session opened in THIS repo work with full context. Sessions here do not inherit other directories' memory — this file plus CLAUDE.md is the bridge. **Workstream 1 is done** (`bundle/template-strip`): the Stay.WitUS hotel domain is gone and the platform spine is renamed to RealEstate.WitUS. See "Post-strip state" below for exactly what survives.*

> **Current plan: `plans/08-tour-engine-port-and-portal-listing-prd.md`** (approved by BAM
> 2026-10-13, amended 2026-10-14). It replaces the engine source for workstreams 2 to 5 below:
> port **Wanderlust's** tour engine (`gemini/wanderlearn/wanderlearn-app`), not
> `virtual-tour-kit`, and build a portal-grade listing page inside plans/03's shell. Its
> phases A to F map onto workstreams 2 to 5. Read it before touching listings, tours, the
> listing page, or the product landing (section 6.5 keeps the landing selling to agents).

## What this is

RealEstate.WitUS (`realestate.witus.online`) is BAM's **virtual-tour product for commercial and residential real estate that's for sale**: professionally captured 360° tours published as fast branded listing pages, with **embeds as a first-class feature** — every paid listing ships an embed snippet agents drop into their own websites. Part of the WitUS ecosystem (registry: `gemini/witus/lib/products.ts`).

## The four founding decisions (BAM, 2026-07-16 — with rationale; don't re-litigate casually)

1. **Tour engine: self-hosted Photo Sphere Viewer core + optional RealSee dollhouse premium.** PSV (MIT; prior art in `gemini/wanderlearn/virtual-tour-kit`) renders panorama+hotspot tours we fully own — embeds are OUR iframe, no per-tour vendor fees. Listings that warrant a dollhouse add a RealSee embed as a premium layer (Insta360 X5 + RealSee app generates dollhouse+floor plan in minutes, ~$3/tour/mo credits). Two tiers, one product.
2. **v1 is service-led:** BAM (or hired shooters) captures and builds tours; agents buy a listing = tour page + embed snippet + hosting. Premium pricing per the market research (US residential $350–$1,000+, commercial $750–$2,000+). Agent self-upload SaaS is a later tier once the pipeline is proven.
3. **Codebase seeded from stay-witus** (this repo): inherits proven runtime tenancy, Better Auth magic-link identity + rbac, platform billing (BAM's Stripe + MoMo claim-then-confirm), /platform admin with domain manager (Vercel API), Mailgun per-tenant sender, Cloudinary signed uploads, support system with screenshots, audit log, test rig (Vitest + Neon integration patterns + Playwright config). Strip the hotel domain (booking/rooms/events/partners/announcements), keep the platform spine.
4. **Customers are agents/brokerages/developers with paid listings; embeds are public** once a listing is live (responsive iframe snippet, click-to-copy per BAM's UI rules) with view analytics. No token/domain-locking friction in v1. FSBO owners and gating variants are future options, not now.

**Design decisions (BAM, 2026-07-16 — see plans/03 for the research):** listing pages = brand theater that converts (full-bleed hero, in-page tour high on the page with tap-to-load poster, facts strip, soft inline inquiry; sold listings keep live tours with a badge) · **shadcn/ui for admin/platform surfaces only** (public pages stay hand-rolled Tailwind) · **public listing pages are light-locked** (photography-first; dark mode remains on admin) · **Leaflet + OSM** for maps · **gallery ships BOTH lightbox-first and scroll-snap strip with an admin toggle** (`galleryMode` in theme JSONB, tenant default + per-listing override) so BAM compares live.

**Schema forward-compatibility (from plans/05, MUST inform workstream 2):** `listings` carry `propertyId` + nullable `buildingId`/`unitId` + a property-kind enum from day one — multi-family/commercial/campus hierarchy, shared-scene inheritance (one lobby tour serving many unit listings), and tenant-to-tenant **ownership transfer** are designed backlog (plans/05), and the flat single-family case just leaves the FKs null.

## Product shape (v1 target)

- **Listing:** address/title, sale metadata (price, beds/baths or commercial specs, status: available/under-offer/sold), photo gallery, the 360° tour (PSV scenes + hotspots), optional RealSee dollhouse embed, optional floor plan, agent contact card, inquiry form.
- **Tour player:** PSV multi-scene with hotspot navigation (port the `virtual-tour-kit` types/components into this stack), mobile-first, tap-to-load on 3G.
- **Embed:** `/embed/listings/[slug]` headless iframe route + snippet generator (the stay-witus embed precedent) — responsive aspect wrapper, OG cards for link sharing, per-listing view counts.
- **Tenancy reuse:** an agency/brokerage = a tenant (their branding on their listing pages, optionally their own domain via the existing domain manager). BAM's own service listings live on the platform tenant. Same machinery, zero new code.
- **Billing reuse:** platform billing as-is — per-listing or per-package invoices via BAM's Stripe or MoMo claim-then-confirm; per-client pricing (BAM sets prices, placeholders + range appendix pattern).

## Where everything lives

| Artifact | Location |
|---|---|
| Before/after + construction-progress spec (the OTHER vertical of this product — Ghana hotel job, diaspora niche) | `gemini/wanderlearn/plans/reports/realestate-witus-before-after-spec.md` |
| Market research (pricing comps, diaspora, competitors, RealSee/X5 findings) | `gemini/wanderlearn/plans/reports/virtual-tour-market-research.md` |
| Hotel tour client docs (proposal, shoot checklist — before-shoot ~July 2026, after-shoot ~Dec 2026) | `gemini/wanderlearn/plans/reports/` |
| PRD_3 "VistaLoft" (original real-estate listings vision) | `gemini/wanderlearn/PRD-insta360... ammendments/PRD_3_Real_Estate_Immersive_Listings.docx` |
| PSV tour engine to port (plans/08) | `gemini/wanderlearn/wanderlearn-app` (Wanderlust): viewer, assembly, tour graph, Moments, floor-plan map. The older `gemini/wanderlearn/virtual-tour-kit/` is superseded |
| Template parent + its handoff/lessons | `claude/stay-witus` (its HANDOFF.md documents the platform spine this repo inherits, incl. the neon-http vs withTx transaction lesson and admin-guard streaming lesson) |
| Repo-local plans (gitignored) | `plans/`: 01 template strip, 02 floor-plan sync SWOT, 03 design direction, 04 node-GUI builder, 05 property hierarchy, 06 imports, 07 em-dash guard, **08 tour-engine port + listing page PRD (current)**, user-tasks/ |

## Post-strip state (what the code actually is now, 2026-07-21)

**Schema — 16 tables, one baseline migration** (`src/db/migrations/0000_baseline.sql`, citext
prepended by hand; the old 0000-0002 history is gone and was never applied to any live DB):
`tenants`, `tenant_domains`, `tenant_memberships`, `platform_settings`, `users`, `sessions`,
`accounts`, `verifications`, `staff_invites`, `platform_invoices`, `tenant_billing`,
`media_assets`, `email_log`, `support_threads`, `support_messages`, `audit_log`.

**Deliberate changes beyond a pure delete — do not undo by reflex:**
- **Roles are now `owner > manager > agent`** (was owner/manager/front_desk + partner + guest).
  `roleSatisfies` is a plain linear rank; the partner and guest lanes are gone with their flows.
- **`emailAndPassword` is enabled with `disableSignUp`** — restored 2026-07-22 for the demo
  accounts, which are the only credential accounts that exist. Everyone real uses magic link.
- **`TenantFlags` is down to `platform | comingSoon | poweredBy`.** The hotel feature toggles
  (events, dining, concierge, hub, virtualTour, announcements) are gone. `EDITABLE_FLAGS` in
  `lib/platform/tenants.ts` is the /platform editor's list.
- **`TenantTheme` keeps `templateKey`/`presetKey`/`fontPairKey` and dropped
  `sectionOrder`/`sectionHidden`/`sectionVariants`** — the section registry was a catalog of
  hotel sections (rooms, dining, concierge). The template/preset/font-pair *mechanism* is
  intact and `/admin/design` still drives it. **`galleryMode` (plans/03) lands here** with the
  listings workstream, alongside a new listing-page section registry.
- **`tenants.payment` (guest→hotel Paystack/Stripe config) is dropped.** Platform billing
  (customer→BAM: Stripe + MoMo claim-then-confirm) is untouched and still works.
- `pgErrorCode` moved from the deleted `lib/booking/holds.ts` to **`src/lib/db-error.ts`**.
  `withTx` is still in `src/db/index.ts` (the neon-http-can't-hold-transactions lesson).
- **Two tenants are seeded:** `pnpm seed:tenants` (platform) and `pnpm seed:demo`
  (`demo-agency`, host `demo.realestate.witus.online`). The hotel crons are gone;
  `vercel.json` carries only the nightly demo reset.

## Naming (BAM, 2026-07-22)

Four stylizations, each with a home. Do not mix them within a surface.

| Form | Where it goes |
|---|---|
| `RealEstate.WitUS.Online` | Full identity: root `<title>`, OG card, footer wordmark, landing eyebrow |
| `RealEstate.WitUS` | The product name in prose and chrome. The default. |
| `RealEstateWitUS` | Compact display where dots read badly |
| `REWitUS` | Tight spaces: manifest `short_name` (home-screen icons truncate) |

`common.brand` / `brandFull` / `brandShort` in `en.json` carry the first three.
Machine identifiers stay kebab-case `realestate-witus` (health `service`, outbox `source`,
Cloudinary folder prefix) — those are ids, not display names.

## The demo (2026-07-22)

`demo.realestate.witus.online` runs the `demo-agency` tenant ("Meridian Property Group",
fictional). Two credential accounts show off RBAC: **owner** (everything incl. Billing) and
**agent** (no design, team, or billing). `/api/demo-login` takes a role, supplies the
password server-side, and redirects into `/en/admin` — the secret never reaches a browser,
and the route only answers on the demo host. The sign-in page shows the buttons and the
layout shows a ribbon, both gated on `hasDemoLogin`.

`src/lib/demo/seed.ts` owns the tenant + wipe/reseed shape; `seedDemoContent` is
**deliberately a no-op today**, not a missing step — sample listings and a real 360 tour
drop into it when workstream 2 lands, and the nightly reset already calls it.

**Env gotcha that cost real time:** an EMPTY key behaves exactly like a missing one
(`Boolean("")` is false). `.env.local` had most keys declared blank, which made auth fail
with a confusing "BETTER_AUTH_SECRET is not set". `vitest.setup.ts` now treats empty as
unset for its test-only fallbacks. See user-task 05.

**Surfaces that survive:** `/[lang]` (platform landing + agency home shell), `/roadmap`,
`/sign-in`, `/invite/[token]`, `/admin` (overview, design, team, support, billing),
`/platform` (tenants, domains, billing, logs, support), `api/auth`, `api/health`, `api/media/*`,
`og`, `sitemap.xml`, `manifest.webmanifest`, middleware locale redirect.

**Placeholder code that exists to be replaced, not extended:** `tenant-header.tsx` (it proves
brand/template resolution end to end and nothing more). `tenant-home.tsx` now lists the agency's
public listings; the admin overview is a door list with Listings first (see "Plan 08 progress").

**All landing and roadmap copy is a Claude-written draft** pending BAM's rewrite
(user-task 04) — the content rule says humans own what customers read.

## Plan 08 progress (2026-10-14, branch `bundle/tour-engine-foundation`)

**Landed (phases A to D):**
- **Schema** (migration 0001, user task 12 runs it): properties (+ bare buildings/units),
  listings, listing_photos, listing_inquiries, listing_views (daily counters, no visitor data),
  tour_floor_plans (one per floor), tour_scenes, scene_links, scene_hotspots, tour_moments,
  scene_moment_panoramas. The start room is a flag on the scene (partial unique index), not a
  listings column, so there's no FK cycle. Media and property references are ON DELETE NO
  ACTION, not RESTRICT, so a tenant delete cascades regardless of trigger order.
- **Engine** (`src/lib/tour/`, `src/components/tour/`): ported from Wanderlust @ c7f5616 with
  provenance headers. PSV pinned at 5.14.1 for all five packages. New here: per-floor mini-map,
  hotspots as buttons, every agent-typed string escaped before PSV renders it, `kind: "inquiry"`
  tour links. `buildTour` is the pure, tested assembly; `loadListingTour` does the queries.
- **Public**: `/[lang]/listings/[slug]` (the plans/08 section 6 design lock), `/embed/listings/[slug]`
  (outside `[lang]`; middleware passes `/embed/`), inquiry and view-count APIs, agency home grid,
  listings in the sitemap.
- **Admin** (`/[lang]/admin/listings/...`): board, new/edit form, photos, embed snippet, numbers,
  inquiries, tour workspace (bulk rooms, graph badges, bulk publish, Connections), room editor
  (click to place arrows and hotspots, start and arrival views, roll, view limit), floor pins.
  Owners and managers edit everything; agents edit listings assigned to them.

**Not yet:**
- Moments admin (phase E): creating Before/After and uploading the second photo per room. The
  data model and the viewer already support it.
- Hiding people and gear (manual blur boxes).
- The still Before/After comparison on the page.
- The landing update (plans/08 6.5) and the demo seed. Both wait for user task 11's photos and
  consent, and the demo seed must re-create the sample listing nightly: `wipeDemoContent`
  deletes listings.

**Decisions for BAM:**
- **Where BAM's own service listings live.** `/admin` refuses the platform host
  (`getStaffContext` returns `no_tenant` for `flags.platform`). Either allow listing admin on
  the platform tenant for the platform owner, or give BAM's service work its own tenant.
- **Cloudinary limits for 360 photos** (user task 13).

**How it was verified without touching Neon:** a throwaway Postgres cluster in the session
scratchpad (`initdb` + `pg_ctl` on TCP 127.0.0.1:54329; the socket path is too long on macOS)
with 0000 and 0001 applied, constraint checks in psql, and the listings integration suite run
through a scratch-only Vitest config that aliases `@/db` to node-postgres. UI was checked with
Playwright on uncommitted fixture pages. Two harness traps:
- Playwright's screenshot caret-hiding writes an inline style before React hydrates in dev, which
  looks like an app hydration bug. Use `caret: "initial"`.
- `next build` and `next dev` share `.next`, so stop dev first.

**Repo gaps found:** ESLint was never configured (`next lint` only prompts), so plans/07's
"chain into lint" needs that first.

## Short-term plan (workstream order)

1. ~~**Template strip** (plans/01)~~ — **done 2026-07-21**, `bundle/template-strip`.
   tsc + vitest + build green; no "stay.witus"/"hotel"/"booking" outside the baseline
   migration's history note.
Workstreams 2 to 5 now follow **plans/08** (phases A to D); the lines below are the
original outline, kept for history.

2. **Listings + tours schema** (plans/08 phase A): properties, listings, tour_scenes, scene_links/hotspots, floor plans, moments, listing_inquiries, view counters. Tenant-scoped like everything else.
3. **PSV tour player** (phase B): port Wanderlust's engine into `src/components/tour/` and `src/lib/tour/`, dynamic import (no SSR), mobile-first.
4. **Public listing page + embed route + snippet generator** (phase C): click-to-copy, responsive iframe, OG image, inquiry form (→ Mailgun to agent + platform; witus-inbox later), and the product landing update (plans/08 section 6.5).
5. **Admin (service workflow)** (phase D): BAM/staff CRUD for listings/scenes + hotspot editor (yaw/pitch click-capture), publish flow, sale-status transitions; agency tenants via existing /platform.
6. **Billing hookup** (listing packages on existing invoices) + product landing page.

**Later:** RealSee premium embed field (host-allowlisted), floor-plan sync (plans/02), **node-GUI tour builder over the same data model** (plans/04 — graph mode for quick wiring + scene mode for yaw/pitch fine-tune, both on CRUD), **property hierarchy + ownership transfer** (plans/05), **CSV/floor-plan/campus-map imports** (plans/06), analytics dashboard, self-serve SaaS tier, the before/after + construction-progress vertical (merge the spec in), Ghana/diaspora marketing content.

## Working rules (inherited; several bit us before)

- **One bundled branch per turn** (`bundle/<slug>`), multiple logical commits fine. Branch → commit → push → stop; BAM merges. Check `git branch --show-current` before EVERY commit; activate the guard: `git config core.hooksPath .githooks`.
- Operator tasks are **repo-local**: `plans/user-tasks/NN-*.md` + 00-descriptions.md index. Migrations always get a run-migration task; BAM runs them.
- UI rules: click-to-copy for copyable values with numbered instructions, action buttons never disappear after use, signed-in state visible on every applicable page. Envelope `{ok,data}|{ok,error,code}` everywhere. slate-* neutrals, 44px targets, no em-dashes in microcopy, mobile-first 375×667, WCAG 2.1 AA.
- Never read .env files. drizzle.config.ts loads env itself (STORAGE_ prefix aware) — keep it.
- **Content rule for this product:** listing copy and photos come from agents and BAM (humans). No AI-generated listing descriptions, staging imagery, or tour content reaches buyers.
