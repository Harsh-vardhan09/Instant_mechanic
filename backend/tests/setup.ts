import 'dotenv/config';

/**
 * Runs before every test file, and before any application module is imported.
 *
 * src/config/env.ts parses process.env at import time and the Prisma singleton is built from
 * the result, so the only place DATABASE_URL can be redirected is here — before the first
 * `import` of anything under src/.
 */

/**
 * Where the tests are allowed to write.
 *
 * Prefer an explicit TEST_DATABASE_URL. Failing that, derive one from DATABASE_URL by moving
 * to a dedicated Postgres SCHEMA in the same database: `?schema=im_test`. Prisma sets
 * search_path from that parameter, so every table the tests create and truncate lives beside
 * the real ones without touching them.
 */
function resolveTestDatabaseUrl(): string {
  const explicit = process.env['TEST_DATABASE_URL'];
  if (explicit) return explicit;

  const base = process.env['DATABASE_URL'];
  if (!base) {
    throw new Error(
      'Neither TEST_DATABASE_URL nor DATABASE_URL is set. Copy .env.example to .env first.',
    );
  }

  const url = new URL(base);
  url.searchParams.set('schema', 'im_test');
  return url.toString();
}

const testUrl = resolveTestDatabaseUrl();

/**
 * The guard that makes "never run against dev data" a fact rather than an intention.
 *
 * Everything downstream TRUNCATEs freely. If the schema resolved to `public` — because
 * someone set TEST_DATABASE_URL to the development URL, which is the obvious mistake — that
 * would wipe the working database. Refuse to start instead.
 */
const schema = new URL(testUrl).searchParams.get('schema');
if (!schema || schema === 'public') {
  throw new Error(
    `Refusing to run tests against schema "${schema ?? '(none)'}". ` +
      'The test database URL must name a dedicated schema, e.g. ?schema=im_test — ' +
      'these tests truncate every table they touch.',
  );
}

process.env['DATABASE_URL'] = testUrl;
// Silences the logger and relaxes nothing else; env.ts validates the value either way.
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] ??= 'test-only-jwt-secret-at-least-32-characters-long';
process.env['CORS_ORIGIN'] ??= 'http://localhost:3000';

export const TEST_SCHEMA = schema;
