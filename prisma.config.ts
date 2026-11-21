import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation is database-free. Only database commands require the explicit
  // direct connection supplied by their guarded operator or local launcher.
  datasource: { url: process.env.DIRECT_URL },
});
