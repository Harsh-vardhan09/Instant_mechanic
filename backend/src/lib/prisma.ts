import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const url = new URL(env.DATABASE_URL);

const num = (key: string, fallback: number): number => {
  const raw = url.searchParams.get(key);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const connectionLimit = num('connection_limit', 5);
const poolTimeoutSec = num('pool_timeout', 10);
const connectTimeoutSec = num('connect_timeout', 10);

// Prisma-engine-only params: meaningless (and potentially fatal) to node-postgres.
for (const key of ['pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout']) {
  url.searchParams.delete(key);
}

const adapter = new PrismaPg({
  connectionString: url.toString(),
  max: connectionLimit,
  // Time allowed to acquire/establish a connection before giving up.
  connectionTimeoutMillis: connectTimeoutSec * 1000,
  idleTimeoutMillis: 30_000,
  // Server-side ceiling on any single query, so one stuck statement cannot pin a connection.
  statement_timeout: poolTimeoutSec * 1000,
});

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('prisma disconnected');
}
