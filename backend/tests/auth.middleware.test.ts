import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { requireAuth, requireRole, signToken } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error.js';
import { env } from '../src/config/env.js';

// Middleware only — no database. Proves the server-side role gate independently of Prisma.
const app = express();
app.get('/protected', requireAuth, (req, res) => void res.json({ data: req.user }));
app.get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => void res.json({ data: 'ok' }));
app.use(errorHandler);

const opsToken = signToken({ sub: 'u_ops', email: 'ops@example.com', role: 'OPS' });
const adminToken = signToken({ sub: 'u_admin', email: 'admin@example.com', role: 'ADMIN' });

describe('requireAuth', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: 'x', email: 'x@x.com', role: 'ADMIN' }, 'wrong-secret-value');
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ sub: 'u', email: 'u@x.com', role: 'OPS' }, env.JWT_SECRET, {
      expiresIn: '-1s',
    });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and exposes only sub/email/role', async () => {
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${opsToken}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['email', 'role', 'sub']);
  });
});

describe('requireRole', () => {
  it('blocks an OPS user from an ADMIN route, server-side', async () => {
    const res = await request(app).get('/admin').set('Authorization', `Bearer ${opsToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an ADMIN user', async () => {
    const res = await request(app).get('/admin').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('token payload', () => {
  it('carries only sub, email and role', () => {
    const decoded = jwt.verify(opsToken, env.JWT_SECRET) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(['email', 'exp', 'iat', 'role', 'sub']);
    expect(decoded['passwordHash']).toBeUndefined();
  });

  it('expires in 7 days', () => {
    const d = jwt.verify(opsToken, env.JWT_SECRET) as { iat: number; exp: number };
    expect(d.exp - d.iat).toBe(7 * 24 * 60 * 60);
  });
});
