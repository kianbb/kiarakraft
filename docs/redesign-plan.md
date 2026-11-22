# Kiara Kraft redesign plan

Version 2, 22 November 2026.

- **Owner:** Kian.
- **Coordinator and approver:** Claude Code. The owner delegated approval to Claude Code on 22 November 2026, except for the reserved items in section 4.
- **Implementer:** Codex.

This plan replaces the restart plan's working order. The security and recovery work from November 2026 stays in place as the foundation and is not repeated here.

## 1. Goal

Rebuild Kiara Kraft as an AI-assisted, Persian-first marketplace for handmade goods that is better, faster and cheaper to run than the 2025 version, and that stays current without large catch-up efforts.

This is an experimental build. It stays private (behind deployment protection, invited test users only) until the owner decides otherwise. Country, legal and provider-region questions are out of scope for now; build the ideal product and revisit those before any public launch.

There are no deadlines. Work proceeds as fast as quality allows, in the order given in section 6.

### Success measures

| Area     | Measure                                                              | Target                                                                |
| -------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Seller   | Time from phone photos to a published listing (seller plus operator) | Under 10 minutes median                                               |
| Seller   | Share of AI draft fields accepted without major edits                | 70% or more                                                           |
| Buyer    | Largest Contentful Paint, p75, mid-range Android on a 4G profile     | Under 2.5 s                                                           |
| Buyer    | Interaction to Next Paint / Cumulative Layout Shift                  | Under 200 ms / under 0.1                                              |
| Buyer    | JavaScript sent on public pages                                      | Under 150 KB gzipped                                                  |
| Cost     | Fixed monthly infrastructure                                         | Within the owner's cap (section 4)                                    |
| Cost     | AI cost per listing draft                                            | Under USD 0.05                                                        |
| Currency | Framework and dependency lag                                         | Patch updates within 1 week, minor within 30 days                     |
| Currency | AI models                                                            | No model names in code; reviewed quarterly against the evaluation set |
| Quality  | Accessibility                                                        | WCAG 2.2 AA on the core journeys, in both languages                   |
| Trust    | Seller originals                                                     | Original photos and text never overwritten; AI output labelled        |

## 2. Principles

1. **Keep the stack, rebuild the product.** Next.js, React, TypeScript, Tailwind, PostgreSQL, Vercel and Neon stay. The interface, the AI layer and several services get rebuilt. No language or framework rewrite.
2. **Persian first, mobile first.** Design and test in Persian on a 390 px wide phone first, then English and desktop.
3. **AI assists, people decide.** AI produces suggestions. Sellers approve their own listings. Operators approve publication. Original photos and text are kept and shown as the source of truth. This is about product trust, not regulation.
4. **Provider-neutral AI.** One internal interface. Models and providers are configuration. An evaluation set decides which model each task uses.
5. **Fewer services.** Every external service must earn its place. Remove duplicates.
6. **Proportionate process.** Strict controls where preserved data, credentials or money are involved. Normal pull-request development everywhere else.
7. **Delete what is not used.** Legacy scripts, unused dependencies, fake UI and dead routes are removed, not worked around.

## 3. Decisions

The coordinator made these decisions. The owner can override any of them at any time. Each major one gets a short record in `docs/decisions/`.

| ID  | Decision            | Choice                                                                                                                                                                                                       |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Market and language | Persian-first marketplace for Iranian handmade goods; English fully supported. Prices shown in toman.                                                                                                        |
| D2  | Hosting             | Vercel for the app, Neon for PostgreSQL. Staging and production stay separate projects and databases. Production stays behind deployment protection.                                                         |
| D3  | AI providers        | Commercial frontier APIs are candidates for each task, chosen by the evaluation set in Phase 3. Open-weight models may be included in the evaluation if cheaper.                                             |
| D4  | Evaluation category | The craft category with the most listings in the preserved catalog, chosen in P0. Synthetic listings fill gaps.                                                                                              |
| D5  | Payments            | Payment adapter with the existing operator-confirmed transfer flow plus one gateway in sandbox mode. No live money.                                                                                          |
| D6  | Sign-in             | Better Auth. Existing email and password kept. Add passkeys and email one-time codes. Phone one-time codes through an SMS adapter with a development provider; a real SMS provider is chosen only if needed. |
| D7  | Budget              | Set by the owner (section 4). Until then: no new paid plans, AI spend only for the evaluation set and testing.                                                                                               |
| D8  | Brand direction     | Keep the name and logo. The coordinator picks a visual direction in Phase 2 and shows it to the owner, who can veto it.                                                                                      |

## 4. Operating model

### The loop

Claude Code coordinates; Codex implements. Each cycle:

1. **Brief.** Claude picks the next task from this plan and `STATUS.md` and writes a task brief: goal, scope, files likely involved, acceptance checks, and anything out of bounds.
2. **Build.** Claude runs Codex non-interactively (`codex exec`) in a dedicated worktree on a task branch. Codex implements, writes tests, runs the checks, leaves the changes uncommitted, and ends with a handoff note: what changed, checks run with results, what was not checked, open questions.
3. **Audit.** Claude reviews the diff, re-runs the checks itself, and for UI work looks at screenshots in Persian and English at 390 px and 1280 px.
4. **Decide.** Claude either approves (commits the work, then merges the task branch into `main` through a PR with the audit summary in the description) or returns ranked findings to Codex in the same session (`codex exec resume`) and repeats from step 2.
5. **Record.** Claude updates `STATUS.md`.

Agreement between agents is not evidence. Re-run results are.

### Risk tiers

| Tier | Covers                                                                                                                                     | Process                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Writes to the preserved original database or assets, credential changes, production deployments, hosting configuration, real personal data | Codex writes a short plan first. Claude reviews it before execution. Before any write to preserved data, a fresh backup is taken and verified. Result recorded in the PR. |
| 2    | Schema migrations, authentication changes, AI provider or model changes, staging deploys, new external services on free tiers              | Normal PR with tests; Claude audits before merge.                                                                                                                         |
| 3    | UI, refactors, tests, docs, local tooling, dependency updates                                                                              | Normal PR with CI passing; Claude audits before merge.                                                                                                                    |

Tier 2 and 3 work does not use frozen packets, hash-bound plans, one-shot latches or evidence-only commits. Evidence goes in the PR description.

### Reserved for the owner

Claude does not approve these. They go to Kian:

- Spending above the agreed cap, or signing up for any paid plan.
- Permanently deleting the preserved original data, its backups, or the original product images.
- Making the site publicly accessible.
- Anything that needs the owner's own login, multi-factor approval, payment details or identity.
- Giving other people access to the code, hosting or data.

### Rules that still apply

The safety rules in `AGENTS.md` stay: no production credentials in development workers, no historical reset or seed scripts, no printing secrets, synthetic data for tests. Never weaken a check to get a green build.

### Status

- `STATUS.md` at the repo root, at most one page: current phase, done, in progress, blocked, next.
- Commit messages describe code changes. No commits whose only content is a status record.

## 5. Checkpoints

At the end of each phase Claude writes a short phase review in `docs/reviews/phase-N.md`: what was built, checks re-run and their results, screenshots, open issues carried forward. The owner can read these to follow progress; they do not need a reply.

## 6. Phases

Phases run in this order. Phases 1, 2 and 3 can overlap once Phase 0 is done.

### Phase 0: Reset

| ID   | Task                                                                                                                                                                                                                                                                                                                                                                                                                | Tier |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P0-1 | Push `task/eslint-ten` (`e7305d3`: Prisma 7, ESLint 10, privacy, order and return fixes) to GitHub. Check that every other task branch is either contained in it or listed as abandoned. Tag old branches `archive/<name>` before removing their worktrees. Do not delete branches.                                                                                                                                 | 3    |
| P0-2 | Make `main` the single source of truth. First confirm the original Vercel project will not automatically deploy `main` to production, or turn that off. Then merge the consolidated branch into `main` through a PR. Close or supersede draft PRs #318, #320 and #321. Triage the open Dependabot PRs.                                                                                                              | 1    |
| P0-3 | Remove nested worktrees. Keep one checkout plus at most three task worktrees, all directly under `.worktrees/`.                                                                                                                                                                                                                                                                                                     | 3    |
| P0-4 | Keep the private evidence branch `prepare/staging` as an archive; do not merge its evidence documents into `main`. Move the 2025 root-level reports to `docs/archive/`. Rewrite `AGENTS.md` and `CLAUDE.md` to reflect section 4, at about a third of their current length, including the owner's delegation of approval.                                                                                           | 3    |
| P0-5 | Remove the fake ratings (`RatingStars rating={4.5}` and "23 reviews") from the product page and product card. Show real review data or nothing.                                                                                                                                                                                                                                                                     | 3    |
| P0-6 | List current monthly spend and free-tier usage per service (Vercel, Neon, Cloudinary, Sentry, Resend, Azure Translator, OpenAI, domain) in `STATUS.md`.                                                                                                                                                                                                                                                             | 3    |
| P0-7 | Move legacy scripts that can damage data out of `package.json` into `scripts/legacy/` with a guard: `db:seed:production`, `db:reset`, `moderation:approve:*`, `images:generate:*`, `images:replace:*`, `images:fill:*`, `prisma:baseline:clear`. Remove unused dependencies after checking imports (`@google/generative-ai`, `node-fetch`, `@types/node-fetch`, `ts-node`, and others found by a dependency check). | 3    |
| P0-8 | Choose the evaluation category (D4) from the preserved catalog's category counts, using a read-only query.                                                                                                                                                                                                                                                                                                          | 1    |

### Phase 1: Platform foundation

**1A. Framework currency**

- Move `middleware.ts` to `proxy.ts` (Next.js 16 convention) with the official codemod, then confirm the file and function were both renamed and auth and locale routing still work.
- Turn on the React Compiler and fix the 48 current lint warnings, most of which are effects that set state synchronously.
- Build with Turbopack if the build and tests pass with it. Keep webpack only if a concrete incompatibility is recorded.
- Adopt Cache Components and `use cache` for public catalog pages, with cache tags invalidated when a product, shop or category changes. Private pages and API responses stay uncached.
- Use Server Actions for form mutations where they replace API routes used by only one page. Keep API routes used by external callers or the service worker.
- Move Tailwind fully to CSS-first configuration and delete `tailwind.config.ts.backup`.
- Read the version-matched documentation before each change. Record any framework feature that was skipped and why.

**1B. Background work**

- Replace `setImmediate` and `waitUntil` background work with durable jobs. Compare a PostgreSQL `Job` table (claimed with `FOR UPDATE SKIP LOCKED`, run by Vercel Cron) against Vercel's managed queue or workflow option, and choose the simpler one that gives retries, failure visibility and stale-result protection. This fixes audit finding JOB-01.

**1C. Authentication**

- Migrate from NextAuth 5 beta to Better Auth, following the official migration guide. Auth.js is now maintained by the Better Auth team for security fixes only.
- Keep existing users and password hashes, and keep the session-revocation and password-reset protections with their tests.
- Add passkeys, email one-time codes and phone one-time codes (development SMS provider) per D6. Rate-limit by account and by IP.
- Claude audits this before merge with cross-account and session-revocation tests.

**1D. Services consolidation**

- Email: one provider behind one adapter. Remove the other.
- Images: one upload pipeline. Check file bytes, strip metadata, keep the original privately, generate AVIF and WebP derivatives at three sizes, serve from the CDN. Keep Cloudinary if it stays within the free tier; otherwise Vercel Blob or S3-compatible storage. This fixes FETCH-01.
- Translation: Azure Translator is removed in Phase 3 when LLM translation is ready.
- Monitoring: wire Sentry correctly (OBS-01) on the free tier.
- Analytics: add a server-side `Event` table for the success measures (listing drafted, approved, published, viewed, ordered, delivered). Keep or remove Vercel Analytics depending on cost.

**1E. Testing and updates**

- Add `@playwright/test`. End-to-end tests for three journeys, in both languages, in CI against a local build: buyer browse to order; seller sign-up to published listing; operator approval to delivery.
- Weekly grouped dependency updates; patch updates merge automatically when CI passes.

### Phase 2: Design and UX

**2A. Direction**

- Claude writes a one-page design brief: audiences (buyers, artisans, operator), tone, and what makes a handmade marketplace trustworthy (maker stories, real photos, region and technique).
- Codex builds two visual directions as static mock pages covering home, product page and seller dashboard, in Persian at 390 px. Claude picks one and shows it to the owner, who can veto it (D8).

**2B. Design system**

- CSS tokens: colour, type scale, spacing, radius, shadow, motion.
- Vazirmatn for Persian and a matching Latin face. Persian digits in Persian UI.
- Logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) everywhere so RTL and LTR share one layout.
- Persian calendar dates with `Intl.DateTimeFormat('fa-IR-u-ca-persian')`.
- Toman prices with Persian grouping in Persian UI.
- Components on the existing Radix and shadcn-style base, updated for Tailwind 4: button, input, select, dialog, sheet, card, product card, price, badge, tabs, toast, empty state, skeleton.
- A components page at `/[locale]/dev/components`, not linked publicly, showing every component in both directions.

**2C. Screens**, each in both languages, mobile first, in this order:

1. Product page: original photos first, maker card, materials and technique, dimensions, delivery and return terms, real reviews.
2. Home and explore: categories, regions and techniques, makers, search entry.
3. Search results with filters.
4. Shop (maker) page with story and products.
5. Cart and checkout in as few steps as possible.
6. Seller app: dashboard, new listing flow (AI parts from Phase 3), orders, returns.
7. Operator console: listing review queue, seller verification, orders, returns, payments.
8. Account, orders, returns, help, legal pages.

Remove unfinished or misleading controls (UX-01): the unfinished share action, mixed-language errors, raw translation keys.

**2D. Quality bar**

- WCAG 2.2 AA on the core journeys: axe checks in the end-to-end tests plus keyboard and screen-reader spot checks.
- The performance budgets from section 1, measured with Lighthouse in CI on public pages.

### Phase 3: AI layer

**3A. AI gateway (first)**

One module, `lib/ai/`, used by every AI feature:

- Task functions, not model calls: `draftListing`, `translate`, `embed`, `triageListing`, `draftSupportReply`.
- Provider adapters behind one interface. Model and provider per task come from configuration. Delete the hardcoded `gpt-5-mini-2025-08-07`, `gpt-image-1` and `dall-e-3` references.
- Structured output validated with Zod. Invalid output is a failure, not a partial success.
- The existing budget reservation (`lib/ai-budget.ts`) applies to every call. Record provider, model, prompt version, tokens, cost and latency per call.
- Prompts are versioned files in the repo.
- Timeouts, one retry with a new reservation, and a clear failure state in the UI. Listing creation works without AI.

**3B. Evaluation set (second)**

- 40 listings from the D4 category: preserved catalog items plus synthetic ones, each with photos, a short Persian seller description, and a reference listing.
- A script runs any candidate model on the set and scores faithfulness (no invented materials, sizes or techniques), Persian quality, English translation quality, category and attribute accuracy, cost and latency. Claude reviews the scores and a sample of outputs; the owner can spot-check Persian quality.
- Results saved as dated files in `eval/results/`.
- For each task, pick the cheapest model that meets the quality bar. Re-run quarterly and when providers release new models.

**3C. Assisted listing (main feature)**

The seller takes photos and writes or dictates a short description in Persian. Then:

1. The system drafts Persian and English title and description, category, attributes (material, technique, region, dimensions, care), tags, and photo tips ("photo is dark", "add a photo showing size").
2. The seller sees the draft beside their own words and photos, edits, and approves.
3. The operator reviews and publishes.

Data model:

- `ListingDraft` and `AISuggestion` tables storing each suggestion with source revision, model, prompt version and status (accepted, edited, rejected). Product fields change only when the seller approves.
- Original photos and text stored unchanged and always available. This fixes AI-03.
- A `ProductAttribute` table so search and filters can use attributes.

Measure time per listing, accepted-field rate and cost per draft.

**3D. Photos**

- Default: non-generative fixes only. Auto-rotate, crop, straighten, exposure and white balance with `sharp`.
- Optional AI background cleanup, clearly labelled, with the original shown first.
- No generated product images and no generated lifestyle scenes. Never present an AI image as a photo of the item.

**3E. Translation**

- LLM translation between Persian and English with a glossary of craft terms (for example khatam, minakari, termeh, ghalamkar) kept in the repo.
- Translations tied to the source revision, so a newer edit marks the old translation stale instead of being overwritten by it.
- Sellers and operators can edit any translation.
- Remove Azure Translator once this passes the evaluation set.

**3F. Search and discovery**

- Persian normalisation at index and query time: Arabic ي and ك to Persian ی and ک, zero-width non-joiner handling, Persian and Arabic digits, diacritics. This fixes SEARCH-01.
- Replace the current English-only `to_tsvector('english', ...)` plus `ILIKE` search with hybrid search: full-text search on normalised text plus `pgvector` similarity on multilingual embeddings, combined by rank.
- "Similar items" on product pages from the same embeddings.

**3G. Operator assistant**

- Review-queue triage: flags likely prohibited items, likely mass-produced items, duplicate or stock photos and missing information. Flags order the queue; the operator decides. Define this policy and resolve the stale `REVIEW` expectation in the legacy moderation test.
- Draft replies to buyer and seller messages in Persian for the operator to edit and send.

**3H. Catalog import (after 3C works)**

- Bulk drafts from a seller's own data export (Instagram data download, Telegram channel export or spreadsheet). Each item goes through the 3C approval flow.

**3I. Buyer assistant (last, optional)**

- A gift-finder chat on top of search, built only if the search and catalog work is solid. It recommends real listings only and links to them.

### Phase 4: Commerce and release readiness

- Payment adapter with the existing operator-confirmed transfer flow plus one gateway in sandbox mode (D5). Test signed callbacks, amount and order matching, duplicates, failures and refunds against the sandbox.
- Shipping with manual tracking entry. Delivery date drives the existing 30-day return window.
- A simple ledger: order amount, commission, seller payout due, payout sent with a reference. Operator reconciliation view.
- Migrate the 44 preserved catalog products into the new data model as drafts. Do not publish them automatically (Tier 1, fresh verified backup first).
- Deploy the new version to the protected production project (Tier 1).
- Operator runbook: review queue, payment confirmation, delivery problems, returns, refunds, payouts.

### Phase 5: Private trial

- Run the full buyer, seller and operator journeys with invited test users. Record the success measures from the `Event` table.
- Fix issues and decide what to automate next.
- Before any public launch, the owner reviews legal, country and provider questions (reserved item).

## 7. Keeping it current

- Weekly grouped dependency updates; patch updates merge automatically when CI passes.
- Framework minor versions within 30 days after reading the release notes.
- AI models reviewed quarterly by re-running the evaluation set. A model change is a configuration change plus an evaluation result.
- One short decision record in `docs/decisions/` for each decision in section 3 and each major technology change.
- Twice a year Claude reviews the stack against current releases and lists what is behind.

## 8. Out of scope

- Native mobile apps. The PWA covers this stage.
- Multi-seller carts and split payments.
- Paid advertising features.
- Microservices or a separate backend.
- Generated product imagery.
- Legal, sanctions and country-availability work, until the owner considers a public launch.

## 9. First cycle

1. Claude commits this plan and pushes `task/eslint-ten` (P0-1).
2. Codex does P0-3, P0-5, P0-6 and P0-7 on a task branch from `e7305d3`, and drafts the new `AGENTS.md` and `CLAUDE.md` (P0-4).
3. Claude audits and merges, then handles P0-2 and P0-8 as Tier 1 steps.
