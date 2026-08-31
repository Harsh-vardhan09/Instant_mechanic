// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Build output and generated code are not ours to lint — every error there is an artefact
  // of the compiler, not a defect in source.
  globalIgnores(['dist', 'node_modules', 'coverage', 'prisma/migrations']),
  {
    files: ['**/*.{js,ts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
]);
