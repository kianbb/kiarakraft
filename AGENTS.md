# Kiara Kraft project instructions

Follow the [redesign plan](docs/redesign-plan.md). Kian owns the project and has delegated coordination and approval to Claude Code within the limits below. Codex implements on a task branch in a dedicated worktree, leaves changes uncommitted and hands off results. Claude audits, reruns checks, approves and merges through a PR, then updates `STATUS.md`.

## Risk tiers

1. Preserved database or asset writes, credentials, production deploys, hosting configuration and real personal data require a short plan reviewed by Claude before execution. Verify a fresh backup before writing preserved data.
2. Migrations, authentication, AI provider or model changes, staging deploys and new free services require a PR with tests and Claude's audit.
3. UI, refactors, tests, docs, local tooling and dependencies require a PR with passing CI and Claude's audit.

Kian reserves spending above the cap, paid plans, permanent deletion of preserved data, backups or original images, public access, actions requiring his login, MFA, payment details or identity, and granting others access to code, hosting or data.

## Engineering rules

- Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, next-intl, Prisma 7 and PostgreSQL. Check `package.json` and the lockfile for versions, and use version-matched primary documentation for framework and provider changes.
- Persian (`fa`, RTL) is the primary experience; English (`en`, LTR) is fully supported. Change both locale files together and check rendering in both.
- Check authorization and object ownership on the server. Public APIs return explicitly selected fields only.
- Schema changes are new forward migrations, tested on the isolated local database first. Do not edit applied migrations, use `db push` to hide drift, or run `prisma migrate dev` against a hosted database.
- AI features keep sellers' original photos and text unchanged; suggestions are stored separately until the seller approves them. Model names are configuration, not code.
- Do not copy `.env`, `.vercel/`, `.demo-credentials.txt` or `prisma/dev.db` into worktrees.

## Local work and verification

Follow [development](docs/development.md) for `npm run setup`, `npm run dev:local` and `npm run start:local`. Verify the isolated database identity. Use synthetic data, keep production credentials out of workers, never print secrets or run historical reset or seed scripts, and keep checks intact.

Run `npm run verify`, plus `npm run test:integration` for database changes and `npm run build:local` for app changes. For rendering, run `npm run test:i18n` against loopback and review Persian and English at 390 and 1280 px. Report results and gaps.
