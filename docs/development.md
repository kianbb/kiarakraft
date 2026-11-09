# Development

Use Node 22, the committed npm lockfile, and PostgreSQL 16 with `pg_trgm` and `unaccent`. The local launcher manages a separate PostgreSQL instance; it does not require a shared system service. On macOS it detects the Homebrew PostgreSQL 16 installation. Set `KK_PG_BIN` when the binaries are installed elsewhere.

## Setup

```bash
nvm use
npm ci --legacy-peer-deps
npm run setup
npm run dev:local
```

Dependencies must be installed before setup. Setup generates local settings, starts PostgreSQL on loopback, generates Prisma, and applies migrations and synthetic fixtures to the dedicated development and test databases. It does not use hosted service credentials. If prerequisites or database guards fail, correct the configuration rather than substituting a hosted URL.

Generated settings and fixture credentials are ignored by Git and protected with owner-only file permissions. Keep them local. Setup refuses to overwrite an unmanaged local environment file; resolve that conflict without copying secrets into a worker.

The primary checkout defaults to app port `3000` and database port `55432`. Worktrees use path-derived defaults; check for conflicts before running several workers. Set `KK_APP_PORT` and `KK_LOCAL_DB_PORT` during initial setup to select other ports. `KK_APP_PORT` also selects the app's serving port. Keep listeners on `127.0.0.1` and each checkout's state separate.

The local databases are `kiarakraft_dev` and `kiarakraft_test`. Writing test commands require the test database's synthetic identity marker. A matching hostname, database name or `NODE_ENV` value alone is insufficient.

## Commands

| Command                                            | Purpose                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev:local`                                | Run the app with isolated local settings                             |
| `npm run db:local:start` / `npm run db:local:stop` | Manage this checkout's PostgreSQL instance                           |
| `npm test`                                         | Run database-free unit and application regressions                   |
| `npm run test:tooling`                             | Check environment, database and tooling boundaries                   |
| `npm run db:test:prepare`                          | Apply migrations and synthetic fixtures to the guarded test database |
| `npm run test:integration`                         | Run guarded database-writing tests                                   |
| `npm run verify`                                   | Run formatting, type, lint, unit/tooling and locale checks           |
| `npm run build:local` / `npm run start:local`      | Build and serve the local production build                           |
| `npm run security:secrets`                         | Scan staged content with redacted output                             |
| `npm run security:secrets -- --tracked`            | Scan tracked working files                                           |
| `npm run security:secrets -- --all-history`        | Scan reachable Git history                                           |
| `npm run security:audit`                           | Audit production dependencies                                        |
| `npm run test:legacy:moderation`                   | Run the separate legacy moderation suite                             |

Both `npm run build` and `build:local` use isolated settings. The deployment build uses its deployment environment. Builds do not apply migrations; hosted migrations require a separate reviewed operation.

## HTTP checks

Start the isolated local production build in another terminal, then target its explicit loopback URL. Replace the example port with the checkout's selected app port.

```bash
npm run build:local
npm run start:local
```

```bash
NEXT_URL=http://127.0.0.1:3000 npm run test:i18n
NEXT_URL=http://127.0.0.1:3000 npm run test:application
NEXT_URL=http://127.0.0.1:3000 npm run test:password-security
```

The locale smoke checks must fail when the server is absent or returns an error. Application/password checks verify the synthetic database identity, may temporarily change or create their own fixtures, and restore or remove those fixtures afterward. Run them sequentially against one checkout. They are not safe substitutes for staging tests against a hosted target.

Unit tests and local checks do not exercise paid AI, mail delivery or live payment gateways. Provider mocks demonstrate the tested local behavior only. Review Persian/English rendering, mobile interaction and accessibility separately when affected.

## Environment boundaries

The launcher constructs a restricted environment before application/database tooling runs. It clears inherited provider credentials and forces paid AI/translation admission settings to zero. Keep that behavior covered when adding configuration. A provider key alone must not enable spending.

Do not run arbitrary maintenance scripts with a hosted environment implicitly loaded. Never reset an existing hosted database, run production seed scripts for local setup, repair migration history to conceal drift, or replace remote assets incidentally. Preserve existing data and add forward migrations.

Local isolation reduces accidental access. Filesystem permissions, credential separation, network controls and server authorization remain necessary: a worktree or instruction file does not enforce all of those boundaries.

## Parallel work

Start independent tasks from reviewed, committed code:

```bash
npm run worktree:new -- task-name
```

Open the resulting task worktree separately, install locked dependencies and run setup there. Uncommitted changes are not included. Do not manually copy credentials, deployment metadata or database files. Use distinct state and ports; do not stop another worker's database.

One coordinator integrates and verifies changes. Workers own bounded tasks and report exact checks, failures and verification limits. Coordinate lockfile and migration changes through designated owners.

## CI and release

Functional CI uses a dedicated PostgreSQL service, synthetic fixtures, isolated builds and local HTTP checks. Security scanning runs separately. Inspect the workflow files for the current commands; local success does not establish remote CI success.

Keep failing checks visible. Fix configuration errors without weakening guards, and resolve findings before release or document a narrowly reviewed exception. Reports should identify a redacted location without exposing credentials or confidential evidence.

Production and staging require separate configuration, credentials, access controls and human release review. Follow [staging](staging.md); a GitHub approval gate alone does not establish that an independent hosting deployment is protected.

## Dependency compatibility

The application SMTP transport is installed as `smtp-mailer` (an npm alias of maintained Nodemailer). Auth.js uses Credentials authentication here; its optional canonical Nodemailer email-provider peer is intentionally absent. The alias retains the real package identity for auditing. Do not install an older canonical Nodemailer to satisfy an unused optional provider. SMTP composition and provider-failure regressions are local checks, not proof of external email delivery.

Sentry 11 uses explicitly restricted collection settings and a static trace lifecycle for existing callbacks. Staging initialization remains disabled. Node SDK event-pipeline tests cover structured-context removal; free-form messages, Browser/Edge integrations and live telemetry require separate review before activation. The application no longer installs the unused Vercel deployment CLI. Manage deployments through the approved hosting connection and release procedure.

## Identity onboarding

New seller identity fingerprints require independent `IDENTITY_HASH_KEY` and `IDENTITY_HASH_KEY_ID` settings. The key is the canonical unpadded base64url encoding of 32 cryptographically random bytes; the non-secret key ID is 1–32 ASCII letters, digits, underscores or hyphens. Generate and store it through the approved secret store; do not paste keys into chat, commands or repository files. Authentication secrets cannot substitute for this key. Missing/invalid configuration returns a generic unavailable response without a profile write.

The fingerprint stores its algorithm/version/key ID in the existing private string field. Ordinary onboarding accepts only a first identity submission and atomically preserves every existing non-null fingerprint and profile state; changes need a separate reviewed re-verification flow. Ten-digit validation accepts Persian, Arabic and ASCII numerals but is format validation, not proof of identity. The raw number is not persisted by this route.

Local launchers clear both identity settings, including inherited/configured values. Database-free and guarded integration tests supply synthetic keys explicitly; staging still rejects identity collection before reading its request. The new key must be provisioned separately before identity collection is enabled in an approved production release. Existing identity data, legacy treatment and credential rotation remain separate operational work.

The historical `npm run lhci` command now fails before loading a browser or network client. Its old live-site/public-upload configuration and unused CLI dependency were removed; historical Git revisions remain preserved. A reviewed protected synthetic performance runner is still needed.
