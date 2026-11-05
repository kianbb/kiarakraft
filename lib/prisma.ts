import { PrismaClient } from '@prisma/client';
import { assertDeploymentPolicy } from './deployment-policy';
import {
  guardStagingPrisma,
  verifyStagingDatabaseTargets,
} from './staging-database';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const environment = { ...process.env };
const policy = assertDeploymentPolicy(environment);
// Never reuse a global client whose connection was created under another mode.
const client =
  policy.mode === 'staging'
    ? new PrismaClient({ datasourceUrl: policy.databaseUrl.href })
    : (globalForPrisma.prisma ?? new PrismaClient());
export const prisma =
  policy.mode === 'staging'
    ? guardStagingPrisma(client, () =>
        verifyStagingDatabaseTargets(environment, false)
      )
    : client;

if (process.env.NODE_ENV !== 'production' && policy.mode === 'standard')
  globalForPrisma.prisma = prisma;
