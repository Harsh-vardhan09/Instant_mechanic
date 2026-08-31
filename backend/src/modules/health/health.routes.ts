import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../shared/asyncHandler.js';

const DB_PING_TIMEOUT_MS = 2_000;

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  db: 'up' | 'down';
  timestamp: string;
}

/**
 * Actually pings the database rather than assuming it is there. The timeout is the whole
 * point: without it a health check against an unreachable Supabase hangs as long as the TCP
 * stack allows, and a load balancer waiting on that check cannot tell "slow" from "dead".
 */
async function pingDb(): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('db ping timeout')), DB_PING_TIMEOUT_MS);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const healthRouter: Router = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const db = await pingDb();
    const body: HealthResponse = {
      status: db === 'up' ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      db,
      timestamp: new Date().toISOString(),
    };
    // 503 when the DB is down so a load balancer or uptime check reacts, instead of a
    // green 200 carrying "db":"down" that nobody reads.
    res.status(db === 'up' ? 200 : 503).json(body);
  }),
);
