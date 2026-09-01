import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { logger } from './lib/logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '..', 'openapi.yaml');

export const docsRouter: Router = Router();

try {
  const spec = YAML.parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
  docsRouter.use(swaggerUi.serve);
  docsRouter.get('/', swaggerUi.setup(spec, { customSiteTitle: 'instant-mechanic API' }));
  docsRouter.get('/openapi.json', (_req, res) => void res.json(spec));
} catch (err) {
  logger.error({ err, specPath }, 'failed to load openapi.yaml — /api/docs will report 503');
  docsRouter.get('/', (_req, res) => {
    res.status(503).json({
      error: { code: 'DOCS_UNAVAILABLE', message: 'API documentation failed to load' },
    });
  });
}
