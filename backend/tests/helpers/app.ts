import { createServer } from 'node:http';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initIo } from '../../src/realtime/io.js';
import { TEST_PASSWORD } from './fixture.js';

/**
 * The real Express app under test — not a stub or a subset. Supertest binds it to an
 * ephemeral port per request, so no server has to be started or torn down.
 *
 * socket.io is attached to a throwaway http.Server that never listens. The booking write
 * paths call emitBookingUpdate, and io.ts deliberately THROWS when uninitialised rather than
 * silently no-opping — so without this every transition test would fail on a missing socket
 * instead of on the behaviour it is checking.
 */
const app = createApp();
initIo(createServer());

export const api = () => request(app);

export interface Tokens {
  admin: string;
  ops: string;
}

/** Logs both roles in through the real endpoint — no hand-minted tokens. */
export async function getTokens(): Promise<Tokens> {
  const [admin, ops] = await Promise.all([
    api().post('/api/auth/login').send({ email: 'admin@test.local', password: TEST_PASSWORD }),
    api().post('/api/auth/login').send({ email: 'ops@test.local', password: TEST_PASSWORD }),
  ]);

  if (admin.status !== 200 || ops.status !== 200) {
    throw new Error(
      `fixture login failed (admin=${admin.status}, ops=${ops.status}) — is the fixture seeded?`,
    );
  }

  return { admin: admin.body.data.token, ops: ops.body.data.token };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
