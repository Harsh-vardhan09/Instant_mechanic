import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Creates the test schema and applies the migration SQL into it.
 *
 * Deliberately does NOT shell out to `prisma migrate deploy`: the Prisma migrate engine takes
 * a Postgres advisory lock, and Supabase's connection pooler does not hold those across a
 * pooled session, so the CLI hangs forever against this database. Executing the migration SQL
 * directly over one connection with search_path set to the test schema does the same job and
 * completes in a second.
 */
export async function ensureTestSchema(databaseUrl: string, schema: string): Promise<void> {
  const url = new URL(databaseUrl);
  // Prisma-only params; node-postgres would forward them as unknown startup options.
  for (const k of ['schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout']) {
    url.searchParams.delete(k);
  }

  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    // Everything below runs inside the test schema, never in public.
    await client.query(`SET search_path TO "${schema}"`);

    const alreadyBuilt = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'bookings'`,
      [schema],
    );
    if (Number(alreadyBuilt.rows[0]?.n ?? 0) > 0) return;

    const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const dir of dirs) {
      const sql = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

/** Table order does not matter — CASCADE resolves the foreign keys. */
const TABLES = [
  'booking_events',
  'booking_assignments',
  'bookings',
  'vehicles',
  'customers',
  'mechanics',
  'services',
  'users',
];

export async function truncateAll(databaseUrl: string, schema: string): Promise<void> {
  if (schema === 'public') throw new Error('refusing to truncate the public schema');

  const url = new URL(databaseUrl);
  for (const k of ['schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout']) {
    url.searchParams.delete(k);
  }

  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  try {
    const list = TABLES.map((t) => `"${schema}"."${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
