import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDeploymentPolicy } from './deployment-policy';
import {
  runtimeDatabaseOptions,
  verifyLocalRuntimeIdentity,
} from './postgres-connection';
import {
  guardPrismaDatabase,
  verifyStagingDatabaseTargets,
} from './staging-database';

const globalForPrisma = globalThis as unknown as {
  localPrisma?: { target: string | undefined; client: PrismaClient };
};

const environment = { ...process.env };
const policy = assertDeploymentPolicy(environment);
const { pool, localKind } = runtimeDatabaseOptions(environment, policy);
const cacheable = Boolean(localKind && environment.NODE_ENV !== 'production');

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    adapter: new PrismaPg(pool, { schema: 'public' }),
  });
  if (policy.mode === 'staging') {
    return guardPrismaDatabase(client, () =>
      verifyStagingDatabaseTargets(environment, false)
    );
  }
  if (localKind) {
    return guardPrismaDatabase(client, () =>
      verifyLocalRuntimeIdentity(pool, localKind)
    );
  }
  return client;
}

const cached = cacheable ? globalForPrisma.localPrisma : undefined;
export const prisma =
  cached && cached.target === environment.DATABASE_URL
    ? cached.client
    : createPrismaClient();

if (cacheable)
  globalForPrisma.localPrisma = {
    target: environment.DATABASE_URL,
    client: prisma,
  };
