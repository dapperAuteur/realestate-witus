# RealEstate.WitUS — repo identity (don't confuse ecosystem repos)

This repo is **RealEstate.WitUS** (`realestate.witus.online`): virtual tours for commercial
and residential real estate that's FOR SALE — service-captured 360° tours as branded
listing pages with first-class **embeds** agents place on their own sites. It is NOT
Stay.WitUS (hotels — this codebase was seeded from that repo, but the hotel domain was
stripped in workstream 1; only the platform spine remains), NOT Wanderlearn (education),
NOT witus-learn (LMS). Registry: `gemini/witus/lib/products.ts`.
Context: **HANDOFF.md first** — its "Post-strip state" section lists what survives and
which strip decisions (roles, flags, theme keys, disabled password auth) not to undo.

## Architecture invariants (inherited from the stay-witus spine — keep)

- **Runtime multi-tenant:** every domain table carries `tenantId`; tenant-facing queries
  flow through `requireTenant()`. An agency/brokerage = a tenant; BAM's service listings
  live on the platform tenant. Cross-tenant queries only in `/platform`.
- **Staff roles are linear: `owner > manager > agent`.** Auth is magic-link only
  (`emailAndPassword` is off by design). Transactions go through `withTx` (`src/db/index.ts`),
  never the default neon-http client.
- **Tour engine is self-hosted Photo Sphere Viewer** (port of `wanderlearn/virtual-tour-kit`).
  Embeds are OUR iframe (`/embed/listings/[slug]`). RealSee dollhouse is an optional
  premium EMBED on a listing (host-allowlisted), never the core renderer.
- **Platform billing** (customer → BAM): BAM's Stripe or MoMo claim-then-confirm;
  per-client pricing in tenant billing tables. BAM sets prices himself.
- **Email is Mailgun**, per-tenant `from`. **Auth is product-local Better Auth**
  (magic link; staff invites; no shared WitUS OIDC for customer tenants).
- **Embeds are public once a listing is live** — no tokens/domain locks in v1.
- **No AI-generated content reaches buyers** (listing copy, photos, tours are human-made).

## Working rules (WitUS shared + BAM-specific)

- **One bundled branch per turn: `bundle/<slug>`.** Never commit on `main`; check
  `git branch --show-current` before EVERY commit. Guard: `git config core.hooksPath .githooks`.
  Branch → commit → push → stop; BAM merges via GitHub UI. Conventional Commits.
- **Operator tasks are repo-local:** `plans/user-tasks/NN-slug.md` + 00-descriptions.md
  index, explicit step-by-step. Every migration files a run-migration task — BAM runs
  `pnpm db:migrate`; an unapplied merged migration 500s the next deploy.
- **UI:** copyable values get click-to-copy + numbered instructions; action buttons never
  disappear after use; signed-in state + door to admin/platform visible where applicable.
- **Conventions:** `{ok,data}|{ok,error,code}` envelope; Tailwind only, slate-* neutrals;
  WCAG 2.1 AA; 44px targets; focus-visible ring; mobile-first 375×667; `getDictionary`
  en-first (es hand-translated only); no em-dashes in microcopy; named exports;
  kebab-case files. Full doc: `gemini/witus/docs/shared-ui-ux-dx.md`.
- **Never read .env files.** drizzle.config.ts loads env itself (STORAGE_ prefix aware).
- Key template lessons live in `claude/stay-witus/HANDOFF.md` (neon-http can't hold
  transactions → `withTx` WebSocket Pool; admin layout/page concurrent-render guard;
  vitest `fileParallelism: false` for Neon integration suites).
