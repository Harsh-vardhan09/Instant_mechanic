import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations use the DIRECT connection (5432). pgbouncer in transaction mode cannot
    // hold the advisory locks and DDL session state Prisma Migrate requires — the pooled
    // DATABASE_URL is for the running server only.
    url: env('DIRECT_URL'),
  },
});
