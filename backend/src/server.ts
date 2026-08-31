import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closeIo, initIo } from './realtime/io.js';
import { connectPrisma, disconnectPrisma } from './lib/prisma.js';

const app = createApp();
const httpServer = createServer(app);

// REST and websockets share one port — one thing to deploy, one thing to expose on AWS.
initIo(httpServer);

async function startDB(): Promise<void> {
  try {
    await connectPrisma();
  } catch (error) {
    logger.error(error);
  }
}

startDB();

const server = httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'instant-mechanic api listening');
});

/** Drain in-flight requests before exiting so a deploy does not sever an operator's action. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  const forced = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forced.unref();

  try {
    await closeIo();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await disconnectPrisma();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal));
}
