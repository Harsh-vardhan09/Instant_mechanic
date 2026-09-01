import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from './logger.js';

/**
 * Single PrismaClient. Only repositories import this — controllers never do.
 *
 * Prisma 7 talks to Postgres through a driver adapter, which means the `pg` Pool owns the
 * connection behaviour, not the Prisma engine. Two consequences, both handled here:
 *
 *  1. The tuning params on DATABASE_URL (connection_limit / pool_timeout / connect_timeout)
 *     are Prisma-engine syntax that `pg` does not understand. They are translated into real
 *     Pool options and stripped before the string is handed over, otherwise they would be
 *     forwarded as unknown Postgres startup parameters.
 *
 *  2. `?schema=` is likewise a Prisma-engine param. The adapter ignores it on the connection
 *     string and takes it as an explicit option instead. Without that, a connection string
 *     naming a schema silently reads and writes `public` — which is how a test suite pointed
 *     at ?schema=im_test ends up mutating the development data.
 *
 * Why any of this matters: this process reaches Postgres over the public internet. Every one
 * of these bounds exists so a network fault surfaces as a fast error on an ops screen rather
 * than a request that hangs forever.
 */
const url = new URL(process.env.DATABASE_URL as string);

const num = (key: string, fallback: number): number => {
  const raw = url.searchParams.get(key);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const connectionLimit = num('connection_limit', 5);
const poolTimeoutSec = num('pool_timeout', 10);
const connectTimeoutSec = num('connect_timeout', 10);
/** Undefined means "whatever search_path the role defaults to", i.e. public. */
const schema = url.searchParams.get('schema') ?? undefined;

// Prisma-engine-only params: meaningless, and potentially fatal, to node-postgres.
for (const key of ['pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout', 'schema']) {
  url.searchParams.delete(key);
}

const adapter = new PrismaPg(
  {
    connectionString: url.toString(),
    max: connectionLimit,
    // Time allowed to acquire/establish a connection before giving up.
    connectionTimeoutMillis: connectTimeoutSec * 1000,
    idleTimeoutMillis: 30_000,
    // Server-side ceiling on any single query, so one stuck statement cannot pin a connection.
    statement_timeout: poolTimeoutSec * 1000,
    // Pin search_path as a startup parameter, so EVERY connection the pool opens lands in the
    // right schema. Passing `schema` to the adapter alone is not sufficient: the pool creates
    // connections lazily under concurrency, and a connection that missed the setting silently
    // reads `public`. That is not a hypothetical — it made one dashboard assertion in the test
    // suite return the development database's revenue while every other assertion passed.
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  },
  schema ? { schema } : undefined,
);

export const prisma = new PrismaClient({ adapter });

/** The schema this process actually reads and writes. Exported so tests can assert on it. */
export const activeSchema = schema ?? 'public';

export async function connectPrisma(): Promise<void> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.info({ schema: activeSchema }, 'Prisma connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database');
    throw error;
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('prisma disconnected');
}
