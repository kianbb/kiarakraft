# Kiara Kraft (کیارا کرفت)

A prelaunch marketplace for Iranian handmade goods, with Persian (RTL) and English (LTR) interfaces.

The application uses Next.js, React, TypeScript, Tailwind, Prisma and PostgreSQL. The lockfile defines the installed versions. Development and CI use synthetic data; a successful build does not establish production readiness.

## Local development

Use Node 22 and PostgreSQL 16 with `pg_trgm` and `unaccent` installed.

```bash
nvm use
npm ci --legacy-peer-deps
npm run setup
npm run dev:local
```

Setup prepares an isolated PostgreSQL instance on loopback, generated local settings and synthetic fixtures. Do not substitute hosted credentials or run legacy maintenance scripts for setup.

See [development](docs/development.md) for prerequisites, supported commands and parallel work; [AGENTS.md](AGENTS.md) for contributor and coding-agent instructions; and [staging](docs/staging.md) for deployment boundaries.

```bash
npm run verify
npm run test:integration
npm run build:local
npm run security:secrets -- --tracked
npm run security:audit
```

Database tests and builds use the guarded local environment. Builds do not apply migrations. Review failing checks and security findings before approving a release.

## Security reports

Use [GitHub private vulnerability reporting](https://github.com/kianbb/kiarakraft/security/advisories/new). Follow the [security policy](SECURITY.md), and keep credentials, personal information and exploit instructions out of public issues, pull requests and logs.

License: [MIT](LICENSE).
