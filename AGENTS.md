# Kiara Kraft project instructions

Kiara Kraft (کیارا کرفت) is a prelaunch marketplace for handmade goods. Preserve existing data and assets. Read [development](docs/development.md) and [staging](docs/staging.md) before changing the corresponding workflows.

## Implementation

- Use the existing Next.js App Router, React, TypeScript and Prisma/PostgreSQL architecture. Check `package.json` and the lockfile for versions.
- Application routes live in `app/`, shared code in `lib/` and `components/`, and the database schema and forward migrations in `prisma/`.
- Persian (`fa`, RTL) and English (`en`, LTR) are supported. Update both locale files and verify rendered behavior, not only matching keys.
- Make bounded changes. Coordinate dependency, framework, schema and paid-service changes separately.
- Enforce authorization and object ownership on the server. Use explicit public field projections. Keep private account data out of shared/offline caches.
- Preserve seller source text and original images. AI proposals require explicit publication decisions and must not establish product provenance.
- Use version-matched primary documentation for external APIs and framework changes.

## Local development

- Install locked dependencies, then use `npm run setup` and the supported commands in the development guide.
- Use `dev:local`, `build:local` and `start:local` for application work. `npm test` is database-free; writing database tests use `npm run test:integration`.
- Validate the allowed database target and its identity marker before importing Prisma or running migrations. `NODE_ENV=test` alone is insufficient.
- Use generated synthetic fixtures. Never copy hosted credentials, deployment metadata, database files or real personal information into workers, tests, prompts or artifacts.
- Keep listeners on loopback. Preserve environment sanitization and disabled paid-provider settings; test new configuration boundaries.
- Do not use reset, production seed, migration repair, blanket approval or image-replacement scripts as routine setup. Do not run `prisma migrate dev` against a remote database.
- Add forward migrations. Do not edit applied migrations or use `db push` to hide drift.

## Collaboration and review

- Work on task branches; do not commit directly to `main`. Preserve unrelated changes and existing branches.
- Use one coordinator and up to three workers. Assign independent implementations separate worktrees; shared-checkout writes require explicit disjoint file ownership.
- Use one owner for dependencies/lockfiles and one coordinated owner for schema/migrations. Reviewers inspect the integrated diff independently.
- `npm run worktree:new -- task-name` starts from committed `HEAD`. Install dependencies and run local setup independently in each worktree.
- Worktrees separate files, not credentials, databases or network access. Instructions and `.gitignore` are not security boundaries.

## Security and release

- Never print secrets or matching secret lines. Report findings privately with redacted locations. Removing a secret from files does not revoke it.
- Keep unresolved security details and confidential operational evidence out of public issues, PR descriptions and artifacts. Publication review includes commit ancestry as well as the final tree.
- Do not weaken checks or assertions to obtain green results. Resolve findings or record an explicitly reviewed exception with a narrow scope.
- A PR or GitHub environment gate does not by itself protect a hosting provider's deployment path. Verify hosting access, target identity and credential separation before release.
- Routine authorized edits and local checks may proceed. Production operations, credential/access changes, destructive actions, paid experiments, merges and deployments require their corresponding authorization and human release review.

## Verification

Run `npm run verify` for formatting, types, lint, unit/tooling and locale checks. Run `npm run test:integration` for database changes and `npm run build:local` for application/build changes. With the isolated local app running, use the relevant HTTP checks described in the development guide.

Run staged secret scanning before commits and dependency auditing for dependency changes. Preserve failing gates until findings are resolved. The separately named legacy moderation suite is not part of the default unit command; do not treat unexecuted suites as passing.

Add regressions for changed security behavior using actual handlers or installed-library behavior where practical. An absent server, skipped test or provider mock does not verify the real feature. Report changed files, checks actually executed, failures/skips and remaining verification limits. Passing tests are evidence for their covered paths, not security certification or release approval.
