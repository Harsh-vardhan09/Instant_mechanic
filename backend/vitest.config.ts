import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // setup.ts repoints DATABASE_URL at the test schema. It MUST run before any test file is
    // evaluated, because src/config/env.ts parses the environment at import time and the
    // Prisma singleton is built from it.
    setupFiles: ['./tests/setup.ts'],

    // One worker, one database. The suites share a schema and truncate between files, so
    // running them in parallel would have one suite delete another's fixture mid-assertion.
    pool: 'forks',
    // Vitest 4 removed poolOptions; these are top-level now. One worker, no file
    // parallelism — the suites share a schema and truncate between files.
    maxWorkers: 1,
    fileParallelism: false,

    // The test database is Supabase over the public internet, not localhost. A round trip is
    // ~200ms, and fixture setup is a dozen of them.
    testTimeout: 30_000,
    hookTimeout: 120_000,

    include: ['tests/**/*.test.ts'],
  },
});
