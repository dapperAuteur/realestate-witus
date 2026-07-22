# HANDOFF — RealEstate.WitUS project context

*Created 2026-07-16 at project kickoff; updated 2026-07-21 when the template strip landed. Purpose: let a Claude session opened in THIS repo work with full context. Sessions here do not inherit other directories' memory — this file plus CLAUDE.md is the bridge. **Workstream 1 is done** (`bundle/template-strip`): the Stay.WitUS hotel domain is gone and the platform spine is renamed to RealEstate.WitUS. See "Post-strip state" below for exactly what survives.*

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
| PSV tour engine prior art | `gemini/wanderlearn/virtual-tour-kit/` (types, viewer components, ffmpeg frame-extract script) |
| Template parent + its handoff/lessons | `claude/stay-witus` (its HANDOFF.md documents the platform spine this repo inherits, incl. the neon-http vs withTx transaction lesson and admin-guard streaming lesson) |
| Repo-local plans (gitignored) | `plans/`: 01 template-strip plan, 02 floor-plan-sync SWOT, user-tasks/ |

## Post-strip state (what the code actually is now, 2026-07-21)

**Schema — 16 tables, one baseline migration** (`src/db/migrations/0000_baseline.sql`, citext
prepended by hand; the old 0000-0002 history is gone and was never applied to any live DB):
`tenants`, `tenant_domains`, `tenant_memberships`, `platform_settings`, `users`, `sessions`,
`accounts`, `verifications`, `staff_invites`, `platform_invoices`, `tenant_billing`,
`media_assets`, `email_log`, `support_threads`, `support_messages`, `audit_log`.

**Deliberate changes beyond a pure delete — do not undo by reflex:**
- **Roles are now `owner > manager > agent`** (was owner/manager/front_desk + partner + guest).
  `roleSatisfies` is a plain linear rank; the partner and guest lanes are gone with their flows.
- **`emailAndPassword` is disabled** in Better Auth. It only existed for the two demo hotel
  accounts. Magic link is the only door; `PLATFORM_BOOTSTRAP=true` opens the owner window.
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
- **No demo tenant.** `pnpm seed:tenants` seeds only the platform tenant; demo seeds, demo
  logins, the demo ribbon, and all three cron routes are gone (`vercel.json` crons is `[]`).

**Surfaces that survive:** `/[lang]` (platform landing + agency home shell), `/roadmap`,
`/sign-in`, `/invite/[token]`, `/admin` (overview, design, team, support, billing),
`/platform` (tenants, domains, billing, logs, support), `api/auth`, `api/health`, `api/media/*`,
`og`, `sitemap.xml`, `manifest.webmanifest`, middleware locale redirect.

**Placeholder code that exists to be replaced, not extended:** `src/components/tenant-home.tsx`
and `tenant-header.tsx` (they prove brand/template resolution end to end and nothing more),
and `src/app/[lang]/admin/page.tsx` (a door list where the listings board goes).

**All landing and roadmap copy is a Claude-written draft** pending BAM's rewrite
(user-task 04) — the content rule says humans own what customers read.

## Short-term plan (workstream order)

1. ~~**Template strip** (plans/01)~~ — **done 2026-07-21**, `bundle/template-strip`.
   tsc + vitest + build green; no "stay.witus"/"hotel"/"booking" outside the baseline
   migration's history note.
2. **Listings + tours schema:** listings, tour_scenes, scene_links/hotspots (port kit types into Drizzle), listing_media, listing_inquiries, view counters. Tenant-scoped like everything else.
3. **PSV tour player:** port virtual-tour-kit components into `src/components/tour/`, dynamic import (no SSR), mobile-first.
4. **Public listing page + embed route + snippet generator** (click-to-copy, responsive iframe, OG image) + inquiry form (→ Mailgun to agent + platform; witus-inbox later).
5. **Admin (service workflow):** BAM/staff CRUD for listings/scenes + hotspot editor (yaw/pitch click-capture), publish flow, sale-status transitions; agency tenants via existing /platform.
6. **Billing hookup** (listing packages on existing invoices) + product landing page.

**Later:** RealSee premium embed field (host-allowlisted), floor-plan sync (plans/02), **node-GUI tour builder over the same data model** (plans/04 — graph mode for quick wiring + scene mode for yaw/pitch fine-tune, both on CRUD), **property hierarchy + ownership transfer** (plans/05), **CSV/floor-plan/campus-map imports** (plans/06), analytics dashboard, self-serve SaaS tier, the before/after + construction-progress vertical (merge the spec in), Ghana/diaspora marketing content.

## Working rules (inherited; several bit us before)

- **One bundled branch per turn** (`bundle/<slug>`), multiple logical commits fine. Branch → commit → push → stop; BAM merges. Check `git branch --show-current` before EVERY commit; activate the guard: `git config core.hooksPath .githooks`.
- Operator tasks are **repo-local**: `plans/user-tasks/NN-*.md` + 00-descriptions.md index. Migrations always get a run-migration task; BAM runs them.
- UI rules: click-to-copy for copyable values with numbered instructions, action buttons never disappear after use, signed-in state visible on every applicable page. Envelope `{ok,data}|{ok,error,code}` everywhere. slate-* neutrals, 44px targets, no em-dashes in microcopy, mobile-first 375×667, WCAG 2.1 AA.
- Never read .env files. drizzle.config.ts loads env itself (STORAGE_ prefix aware) — keep it.
- **Content rule for this product:** listing copy and photos come from agents and BAM (humans). No AI-generated listing descriptions, staging imagery, or tour content reaches buyers.
