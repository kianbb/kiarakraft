# Staging

Staging is a separate, access-protected environment for verifying a reviewed revision with synthetic data. It must not share production database credentials, customer records, authentication secrets or provider capabilities. A local production build is useful verification but is not hosted staging.

The configuration and build guards described here are repository controls. Hosting access restrictions, dedicated database provisioning, secret separation and the deployed revision must also be verified externally before use. No hosted deployment is established by this document.

## Environment contract

Every Vercel deployment must explicitly select its application mode. Preview deployments require `KK_DEPLOYMENT_MODE=staging`. A separate staging project also requires `staging` when Vercel labels its first deployment or default branch as production. An actual production release requires `KK_DEPLOYMENT_MODE=production`; the hosting environment label alone does not select the application mode. Configure credentials through the hosting secret store; do not commit environment files or paste values into public logs.

| Setting                                       | Requirement                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `KK_DEPLOYMENT_MODE`                          | `staging` on every deployment of the staging project, including any Vercel production target              |
| `AUTH_URL`, `NEXTAUTH_URL`, `PUBLIC_APP_BASE` | The same canonical HTTPS staging origin                                                                   |
| `NEXTAUTH_SECRET`                             | A randomly generated staging-only secret of at least 32 characters; `AUTH_SECRET`, if present, must match |
| `DATABASE_URL`, `DIRECT_URL`                  | Dedicated staging connections; never production targets                                                   |
| `KK_STAGING_DATABASE_HOST`                    | Expected runtime database hostname                                                                        |
| `KK_STAGING_DIRECT_HOST`                      | Expected direct-connection hostname; defaults to the runtime hostname                                     |
| `KK_STAGING_DATABASE_NAME`                    | Expected dedicated database name                                                                          |
| `KK_STAGING_DATABASE_ID`                      | UUID identifying this staging database                                                                    |

The staging database must contain the expected `kk_staging_guard.identity` marker: mode `staging`, purpose `synthetic-only-v1`, and a deployment identifier matching `KK_STAGING_DATABASE_ID`. The guard also checks the actual database name. Matching a connection URL alone is insufficient. Both database connections require TLS; unsupported connection options are rejected. Any extra CSRF host allowance must be limited to staging.

Provider credentials and paid capabilities are not permitted in this staging mode. Keep paid admission settings disabled and use synthetic/offline behavior. A provider experiment requires a separately reviewed configuration and explicit bounded authorization; do not add keys to make a staging guard pass.

## Provisioning and access

Provision an empty dedicated database and a restricted staging role. Establish its synthetic identity under an authorized provisioning operation, apply reviewed forward migrations, and load synthetic fixtures only. The identity marker is not authorization to relabel an existing production database. Do not create it on a target whose ownership and contents are uncertain.

The application role should have only the privileges it needs; do not grant it control of the identity marker. Keep migration permissions separate where supported. Review provider capabilities and database targets before enabling a build that can reach them.

Protect staging pages and APIs with hosting access controls, including alternate deployment URLs and any automation access. Verify an unauthenticated request is denied before using synthetic test credentials. Do not assume an unlisted URL is private.

## Guarded build

After installing locked dependencies in an authorized staging runner, check the configured targets without initializing or changing either database:

```bash
node scripts/staging/build.mjs --preflight-only
```

This performs configuration and runtime/direct database identity checks. It does not initialize, migrate or seed the target. The normal guarded entry point performs those checks before Prisma generation and the Next.js build:

```bash
node scripts/staging/build.mjs
```

This review configuration disables automatic Git deployments and omits scheduled jobs while staging is being established. Manual deployments still require authorization and all preflight checks. Re-enabling automatic production releases or schedules is a separate reviewed release decision.

Select this entry point in the hosting build configuration. Merely committing the script does not prove that the host invokes it. A preflight failure must stop deployment; do not switch to an unguarded build to proceed. Repository builds do not apply hosted migrations.

## Review and verification

1. Select a reviewed revision and run the local verification, integration tests and isolated build.
2. Confirm hosting access protection, separate secrets and the dedicated database identity. Keep this evidence private and redact values.
3. Run the guarded staging build for that exact revision. A guard failure must stop the build; do not bypass it with local mode or a production URL.
4. Verify the deployed revision and access restrictions, then exercise Persian/English pages and the affected buyer/seller/admin flows using synthetic accounts.
5. Review application logs and failure behavior without exposing credentials or private data. Record what was actually tested, what was mocked, and any remaining limits.

GitHub environment reviewers protect only jobs that reference that environment. Review hosting integrations and automatic preview/production deployments independently. A public PR can also trigger external hosting; verify that path before publishing a branch.

The manual legacy Playwright, Lighthouse and performance-monitoring workflows are suspended until an access-protected synthetic staging runner is verified. Dispatching one fails with an explanation before using secrets, contacting application targets or running tests. Required CI checks continue to exercise the isolated local environment; a suspended workflow is not a passing staging check.

## Promotion

Staging success does not authorize production rollout. Promotion requires human approval, required checks, a reviewed migration sequence, recovery planning and verification of the intended production target. Keep migrations out of ordinary build commands. Preserve existing data and assets, and do not invoke seed/reset/repair scripts incidentally.

Verify provider contracts and real money flows separately before enabling them. Keep sensitive operational evidence and unresolved security details out of public PR descriptions and artifacts.
