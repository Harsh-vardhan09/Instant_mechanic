import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, getTokens, type Tokens } from '../helpers/app.js';
import { TEST_PASSWORD, resetAndSeed } from '../helpers/fixture.js';

let tokens: Tokens;

beforeAll(async () => {
  await resetAndSeed();
  tokens = await getTokens();
});

describe('GET /api/health', () => {
  it('returns 200 and reports the database as up', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptime).toBe('number');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('is reachable without a token', async () => {
    // Health is one of only three public routes; a probe cannot authenticate.
    const res = await api().get('/api/health');
    expect(res.status).not.toBe(401);
  });
});

describe('POST /api/auth/login', () => {
  it('returns the user and a token on valid credentials', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'ops@test.local', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'ops@test.local', role: 'OPS' });
    expect(typeof res.body.data.token).toBe('string');
  });

  it('never returns passwordHash', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'ops@test.local', password: TEST_PASSWORD });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'ops@test.local', password: 'definitely-not-the-password' });
    expect(res.status).toBe(401);
  });

  /**
   * The anti-enumeration property. If these two responses differ in any way an attacker can
   * observe, the login form becomes an oracle for "does this person have an account here".
   */
  it('returns an IDENTICAL response for an unknown email and a wrong password', async () => {
    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email: 'ops@test.local', password: 'wrong-password-here' });

    const unknownEmail = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'wrong-password-here' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.error.code).toBe(wrongPassword.body.error.code);
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    expect(wrongPassword.body.error.message).toBe('Invalid credentials');
  });

  it('rejects a malformed email with 400 before touching the database', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a token', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a malformed token', async () => {
    const res = await api().get('/api/auth/me').set(auth('not-a-jwt'));
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const res = await api().get('/api/auth/me').set(auth(tokens.ops));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('ops@test.local');
  });
});

describe('role enforcement', () => {
  /**
   * Server-side, on the route. Hiding the button in the UI is not access control, so this
   * asserts the API refuses regardless of what any client would have offered.
   */
  it('returns 403 when an OPS user calls the ADMIN-only register route', async () => {
    const res = await api().post('/api/auth/register').set(auth(tokens.ops)).send({
      email: 'sneak@test.local',
      password: 'SneakyPassword123!',
      name: 'Sneak',
      role: 'ADMIN',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an ADMIN to call the same route', async () => {
    const res = await api().post('/api/auth/register').set(auth(tokens.admin)).send({
      email: 'newops@test.local',
      password: 'NewOpsPassword123!',
      name: 'New Ops',
      role: 'OPS',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('newops@test.local');
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('returns 401, not 403, when no token is supplied at all', async () => {
    const res = await api().post('/api/auth/register').send({});
    expect(res.status).toBe(401);
  });
});

describe('the /api authentication gate', () => {
  it('rejects an unauthenticated request to a protected route', async () => {
    const res = await api().get('/api/bookings');
    expect(res.status).toBe(401);
  });

  it('accepts the same request with a token', async () => {
    const res = await api().get('/api/bookings').set(auth(tokens.ops));
    expect(res.status).toBe(200);
  });
});
