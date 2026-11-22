# Kiara Kraft status

Updated 22 November 2026 by Claude Code.

**Current phase:** Phase 0 (Reset)

**Done**

- P0-1: latest code pushed as `task/eslint-ten` (integration line until `main` is consolidated), including the restricted production database checks from `task/production-db-guard`.
- P0-3: 21 superseded worktrees removed; all branches kept. Remaining worktrees: `eslint-ten`, `production-db-guard`, plus the current task worktree.
- P0-4: 2025 reports archived in `docs/archive/2025/`; `AGENTS.md`, `CLAUDE.md` and `SECURITY.md` rewritten for the new workflow.
- P0-5: fake ratings removed; product pages and cards show the average and count of approved reviews, or nothing.
- P0-6: all services on free plans (owner, 22 November 2026).
- P0-7: risky maintenance scripts moved to `scripts/legacy/` behind an opt-in guard; production-seed workflow deleted.

**In progress:** nothing.

**Blocked:** nothing.

**Next**

- Remove the unused dependencies found in P0-7 (see below).
- P0-2: check the original Vercel project will not auto-deploy `main`, then merge `task/eslint-ten` into `main` and close the stale draft PRs.
- P0-8: choose the evaluation category from read-only catalog counts.
- Then Phase 1.

## Unused dependencies found in P0-7

No use found: `@auth/prisma-adapter`, `@google/generative-ai`, `@types/jsdom`, `@types/node-fetch`, `eslint-config-prettier`, `eslint-plugin-prettier`, `tailwindcss-animate`, `ts-node`. Declared directly but used only through other packages: `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `postcss`.

## Services

| Service          | Plan | Use                                   |
| ---------------- | ---- | ------------------------------------- |
| Vercel           | Free | App hosting, `kiarakraft` and staging |
| Neon             | Free | PostgreSQL, production and staging    |
| Cloudinary       | Free | Product images                        |
| Sentry           | Free | Error monitoring                      |
| Resend           | Free | Email                                 |
| Azure Translator | Free | Translation (to be replaced, Phase 3) |
| OpenAI           | —    | AI features, currently disabled       |
