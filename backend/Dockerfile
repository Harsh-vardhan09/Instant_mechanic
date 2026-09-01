# syntax=docker/dockerfile:1
#
# Multi-stage build for the instant-mechanic API.
#
# Two bugs in the previous version this replaces:
#   1. It pinned NODE_VERSION=22.23.2 and built `node:22.23.2-alpine`, a tag that does not
#      exist on Docker Hub, so the build failed before it started. Pinned to the `22-alpine`
#      release line instead, which does.
#   2. It never compiled anything. It copied source and ran `node dist/server.js`, while
#      `dist` was listed in .dockerignore — the image could not have contained the file it
#      was told to run. `prisma generate` never ran either, so there was no client.

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
# Prisma's engines link against OpenSSL. Alpine ships a minimal userland, so install it
# explicitly rather than discovering the omission at first query.
RUN apk add --no-cache openssl

# ── production dependencies ───────────────────────────────────────────────────
# Resolved separately from the build so the runtime image never sees typescript, vitest,
# the Prisma CLI or anything else only needed to produce dist/.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# prisma.config.ts resolves DATABASE_URL/DIRECT_URL through Prisma's env() helper, and .env is
# (correctly) excluded from the build context — so without these the build dies with
# "PrismaConfigEnvError: Cannot resolve environment variable". Placeholders are safe: generate
# reads the schema and writes a client, it never opens a connection. The real values arrive
# from the environment at run time and are never baked into the image.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# Generate BEFORE typecheck: src imports types that only exist once the client is generated.
RUN npx prisma generate
RUN npx tsc

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=8000

# Production dependencies only…
COPY --from=prod-deps /app/node_modules ./node_modules
# …plus the generated Prisma client, which lives inside node_modules and is produced by the
# CLI we deliberately did not install here.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=build /app/dist ./dist
# Migrations and schema travel with the image so `migrate deploy` can run from this container.
COPY --from=build /app/prisma ./prisma
COPY package.json prisma.config.ts ./
# src/docs.ts resolves openapi.yaml as ../openapi.yaml from dist/, so it must be here or
# /api/docs answers 503.
COPY openapi.yaml ./

# `node` (uid 1000) ships with the image. Running as root would let a container escape start
# as root on the host.
RUN chown -R node:node /app
USER node

EXPOSE 8000

# Uses the real endpoint, which pings the database — a container that cannot reach Postgres
# reports unhealthy rather than sitting there accepting traffic it cannot serve.
# start-period covers boot; 3 retries stop a single slow query from cycling the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, no shell wrapper: the process must be PID 1 so it receives SIGTERM directly.
# `npm run start` would swallow the signal and Docker would SIGKILL after the grace period,
# cutting in-flight requests — exactly what the graceful shutdown exists to prevent.
CMD ["node", "dist/server.js"]
