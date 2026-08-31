# instant-mechanic — rules for every prompt

Internal operations dashboard: monitor vehicle-service bookings, mechanics, customers and revenue,
and dispatch mechanics. Split deployment — **Express API on AWS**, **Next.js client on Vercel**.

## Architecture: modular monolith, vertical slices

A feature owns its full stack in one folder. Nothing is organised by technical layer at the top level.

```
backend/src/modules/<feature>/
  <feature>.routes.ts       URL shapes + middleware wiring
  <feature>.controller.ts   HTTP in/out only
  <feature>.service.ts      business rules
  <feature>.repository.ts   the ONLY layer that may touch Prisma
  <feature>.schema.ts       zod schemas for body/query/params
```

**Controllers never touch Prisma. Only repositories do.** A controller importing `lib/prisma` is a bug.
Dependency direction is inward: routes → controller → service → repository. Never the reverse.

## Non-negotiables

1. **Validate at the edge.** Every request body, query and param is parsed by a zod schema via
   `middleware/validate.ts` *before* a controller runs. A controller never sees unvalidated input.
2. **One error path.** Everything goes through `middleware/error.ts`, registered last. Throw `AppError`
   from `shared/errors.ts`. No `try/catch` that swallows — catch only to add context, then rethrow.
3. **List endpoints are uniform.** Every list route supports `page, limit, sort, order, search` and
   returns:
   ```json
   { "data": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
   ```
4. **Aggregates are computed in SQL over the FULL filtered set** — never by summing a paginated page in
   JS. A revenue total that only reflects page 1 is a wrong number presented as a right one, and ops
   makes money decisions on it.
5. **Nothing sensitive leaves the process.** No secrets, tokens, or customer PII in logs or error
   responses. Configure pino redaction in `lib/logger.ts`; error responses carry a message and a code,
   never a stack or a raw DB error.
6. **The frontend never calls Prisma.** It calls the REST API through `lib/api.ts`. Only `backend/`
   holds a database connection.

## Next.js — read the docs first

This repo runs **Next.js 16**, which differs from training data. Before writing any Next.js code, read
the relevant guide in `frontend/node_modules/next/dist/docs/` (resolve from `frontend/`, not the repo
root). See `frontend/AGENTS.md`.

Two things already verified in this codebase:
- `PageProps<'/route'>` and `LayoutProps<'/route'>` are **global** helpers — no import needed.
- Route groups `(auth)` / `(dashboard)` do not appear in the URL. `app/(dashboard)/page.tsx` **is** `/`.
  Do not add `app/page.tsx` — it silently collides with it and wins, with no build error.

## Verify before claiming done

```
cd backend  && npx prisma validate && npx tsc --noEmit && npm test
cd frontend && npx tsc --noEmit && npm run build
```

Gates are computed, not narrated: run the command, paste the exit code.
