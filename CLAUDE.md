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

---

<!-- BEGIN:witus-shared-rules v4 -->
<!-- MANAGED BLOCK — do not edit by hand. Source: gemini/witus/docs/shared-rules.md.
     Update the source, then run `node scripts/sync-claude-rules.mjs` in the witus repo. -->

## ⚠️ Ecosystem identity (shared note — don't confuse repos)

Full ecosystem identity + the canonical product index live in `gemini/witus/CLAUDE.md` and
`gemini/witus/lib/products.ts`. Each repo states *which* product it is in its own hand-owned line
above this managed block; don't infer another app's URLs, routes, IDs, env names, or DB schema —
confirm against that app's own code.

The site **brandanthonymcdonald.com** (BAM's personal portfolio) lives in `claude/bam-landing-page/`
— **NOT** `projects/bam-portfolio/` (the retired legacy static site). Target `bam-landing-page`.

## Operator-task rule — capture user actions in `./plans/user-tasks/`

When Claude proposes work that needs BAM to do something outside the editor (account signup, API
key, DNS change, vendor dashboard, env-var rotation, secret generation, PR review/merge, etc.),
Claude MUST create a `./plans/user-tasks/NN-slug.md` file in this repo. **No exceptions for "small"
steps.** Required sections: **Scope tag** · **What + why** (with explicit *what this blocks* detail
and any hard deadline) · **Steps** · **What Claude will use** · **How to mark done** · **Related**.
Keep `./plans/user-tasks/00-descriptions.md` updated with columns `# | Title | Scope | Blocks |
Status` — the `Blocks` column is the one BAM scans. Ecosystem-wide tasks (Keap, IRL events, retros,
cross-product decisions) live in the canonical witus queue at `gemini/witus/plans/user-tasks/`;
repo-local tasks live here. Read the witus queue at session start before dependent work. Full rule:
`gemini/witus/CLAUDE.md` §"Operator-task rule".

## Branch hygiene — BAM merges, between sessions by default

**Half 1.** Branch → commit → push → stop. Claude does not run `git checkout main && git merge`.
Never `--force` to shared branches. Before every commit run `git branch --show-current`; if it is
`main`/`master`, branch first (`feat/ fix/ chore/ docs/`). After push, hand back the branch name +
summary and stop.

**Half 2.** BAM merges pushed branches via the GitHub UI between sessions. Mid-session, after a
push, BAM may merge in a separate window and the local checkout silently fast-forwards to `main` —
so re-check `git branch --show-current` before **every** commit, not just at branch creation, or you
risk landing follow-up commits directly on `main`.

**Half 3.** Keep branches small (one concern each). When a session produces multiple branches,
consolidate them into one `bundle/<slug>-YYYY-MM-DD` via `git merge --no-ff` (preserves per-concern
history — no squash), resolve conflicts during bundling, run `tsc + lint + build` against the
bundle, push, and file ONE `./plans/user-tasks/NN-merge-bundle-<slug>.md`. BAM does one merge, not N.

**Commit often.** Commit at every working checkpoint — a passing build, a finished sub-step, a green
test — not just at the end. A usage-limit cutoff, a dropped connection, or a crashed session must
never lose more than the last few minutes of work. Small frequent commits on the feature branch keep
the branch un-merged (Half 1 still holds) and give BAM clean per-step history to drill into.

A checked-in `.githooks/pre-commit` guard refuses commits made directly on `main`/`master`. Activate
once per clone: `git config core.hooksPath .githooks`. Full rule: `gemini/witus/CLAUDE.md`
§"Branch-hygiene rule".

## Docs-sync rule — a change isn't done until its docs are current

When a change adds, alters, or removes a user-visible feature/route/scope, update the affected docs
**in the same branch**: README (feature list, env examples, scripts), in-app help/tutorial content,
`ROADMAP.md` **and** any public roadmap page, API/OpenAPI docs, and STYLE_GUIDE/CONTRIBUTING when a
convention changed. State which docs you touched in the handoff. Never leave an aspirational ✅ on a
roadmap — downgrade it with a one-line reason. If a doc update is genuinely out of scope, file it as
a `./plans/` task rather than skipping silently. A Stop hook in `.claude/settings.json` gates on
this: if the session diff changed feature/route files but touched no docs, it blocks once and asks
you to update-or-defer. Schema-only migrations, refactors, perf, and dev-tooling changes don't
trigger it.

## Plans convention

All implementation plans live in `./plans/` as `NN-description-of-plan.md` (two-digit prefix,
kebab-case, next available number, don't skip). Sub-queues: `./plans/user-tasks/NN-slug.md`
(operator tasks), `./plans/bugs/`, `./plans/future/`. (`plans/` is typically gitignored.)

**Finding what BAM mentions: search gitignored files.** Most ideas, plans, decisions, and drafts BAM
refers to live in a `plans/` dir of this repo or another ecosystem repo, and are not tracked by git.
Default `rg`, `git grep`, `git log -S`, and editor search skip gitignored paths, so they miss every
`plans/` dir and report a false "nothing found". Search with `rg -uu` (or `rg --no-ignore`, `grep -r`,
`find`), excluding `node_modules`, `.next`, `.git`, worktrees, and virtualenvs: this repo first, then
the repos in `gemini/witus/docs/ecosystem-repos.json`. A miss from a git-aware search proves nothing;
if the gitignore-aware search also misses, say what you searched and ask BAM where it lives.
Untracked also means unrecoverable: git can't restore an overwritten plan, so read before replacing.
Full rule: `gemini/witus/CLAUDE.md` §"Plans convention".

## New app ideas — vet before building

Before writing code, creating a repo, or onboarding any new product idea, score it with the WitUS
app-idea rubric (`gemini/witus/docs/app-idea-vetting-rubric.md`): search gitignored `plans/` for prior
work, declare the goal with BAM (business / portfolio / community), write the sourced analysis at
`gemini/witus/plans/NN-<slug>-analysis.md`, apply the gates and weighted scores, and file a user task
for any validation BAM does outside the editor. Append lessons and outcomes to the rubric's logs;
gate, weight, and threshold changes need BAM's approval. Full rule: `gemini/witus/CLAUDE.md`
§"New-product vetting rule".

## Citation rule

Anything publishable, teachable, or partner-facing (curriculum, teaching-oriented help articles,
white papers, grant/sponsor/partner writing) uses APA 7 in-line citations with a `## References`
section. Code docs, internal notes, and `plans/user-tasks/*` are out of scope. Full rule:
`gemini/witus/CLAUDE.md` §"Citation rule".

## Blog ledger rule — every blog post goes in the ledger the session it is written

BAM's blog (brandanthonymcdonald.com/blog, repo `claude/bam-landing-page`) has one ledger of every
post, live and waiting, numbered in publishing order: `gemini/witus/plans/playbook/*-blog-ledger.md`
(gitignored; synced to `witus.online/admin/library`). Read it before writing a post, so a topic is
not written twice. When a session in **any** repo drafts a blog post, add it to the ledger's Part 2
in the same session (slug, title, app, branch, publish task, gate, check result), placed after any
post it links to; then rename the file to today's date, update its row in `00-library-index.md`, and
re-render its PDF (`npm run library:pdf -- <file>` in witus). "Published" means listed in
`https://www.brandanthonymcdonald.com/feed.json`, not merged. Publishing order is BAM's call. Full
rule: `gemini/witus/CLAUDE.md` §"Blog ledger rule".

## Authoritative-values rule — never assert guessed external values

When a value is owned by an external system (DNS/registrar, a host like Vercel, a third-party API,
or another ecosystem app's URLs/routes/IDs/env/schema), read it from the authoritative source; don't
hardcode a guessed default and present it as correct. If you must ship a fallback, label it as a
fallback in both UI copy and a code comment. Verify by behavior (does the flow work?), not by
exact-match against a guess. When unsure, flag or ask — never assert. Full rule:
`gemini/witus/CLAUDE.md` §"Authoritative-values rule".

## Coding conventions

UI/UX/DX conventions (a11y, component patterns, TypeScript, microcopy, git-commit vocabulary, the
default Neon+Drizzle+pnpm+Vitest stack) are consolidated in `gemini/witus/docs/shared-ui-ux-dx.md`.
Read it before writing UI or API code. Two repos are grandfathered on Supabase+Jest and documented
there as exceptions.

<!-- END:witus-shared-rules v4 -->
