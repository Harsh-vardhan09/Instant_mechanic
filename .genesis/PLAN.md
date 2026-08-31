# PLAN — instant-mechanic

The machine-parseable implementation plan. Mirrors the milestone table in `DONE.html` (DONE.html is the
human/visual view; this is the one loops read). Sliced so each milestone ships in one L1 BUILD pass.

> Slicing rule: a milestone must have (a) a single clear outcome, (b) an exact **demo command** that
> proves it, and (c) a freeze boundary of files it may touch. If you can't write the demo command,
> the milestone is too vague — split it.

---

## Brainstorm (G0.5)

> Three fundamentally different approaches to the cognitive job. Pick one. Record the rationale.

### Approach A — Next.js full-stack (Server Components read Postgres directly through one query layer)
The dashboard is one Next.js app. Server Components call a `lib/queries` module that owns Prisma;
operator writes go through Server Actions. `backend/` stays dormant until a second consumer exists.
- Strengths: one deployable, one typecheck, one auth session — no CORS, no API tokens, no duplicated
  DTOs; a read-only dashboard is exactly the workload RSC was designed for.
- Weaknesses: no HTTP API for a future mobile app or partner integration without refactoring; couples
  the ops tool to Next.js's server runtime and its serverless connection-pool behaviour.

### Approach B — Split Express REST API + Next.js client (the shape the repo is scaffolded for)
`backend/` serves JSON over Express 5; the Next frontend fetches it. Matches the existing folder layout,
Dockerfile and compose.yaml.
- Strengths: the API is reusable by a future mobile/partner client; backend deploys and scales
  independently of the UI; clean process boundary for the trust gate.
- Weaknesses: every field is written three times (Prisma model, API DTO, client type) for a tool with
  one consumer; two auth surfaces to secure instead of one; strictly more code for zero current benefit.

### Approach C — Buy, don't build (point Metabase/Grafana at the Supabase Postgres)
Stand up an off-the-shelf BI tool against the existing database; build only the dispatch action.
- Strengths: the monitoring half of the job is done in an afternoon with charts, filters, saved views
  and user management already solved; zero code to maintain for the read paths.
- Weaknesses: "request a mechanic" is a write with business rules and cannot live in a BI tool, so a
  custom surface is needed anyway; row-level access control over customer PII is coarse.

### Chosen: **Approach A** — one deployable, one auth session, and the read-heavy dashboard is precisely the RSC workload; `backend/` is parked rather than deleted so Approach B remains one refactor away the day a second consumer appears.

> ⚠️ **Confirm before M2.** This parks `backend/src/` (currently empty, so nothing is lost) and makes
> `frontend/` the deployable. `backend/prisma/` still owns the schema and migrations. If a mobile app or
> partner API is already on the roadmap, say so and we switch to Approach B before M2 — after M2 the
> refactor gets expensive. Approach C is still the honest recommendation for the *monitoring* half if
> nobody has committed to building custom charts.

---

## Milestones

### M1 — Green baseline + data model
- **Outcome:** `tsc` exits 0 in both packages and a Prisma schema exists for Booking, Mechanic, Customer, Payment, AuditEntry with the booking status enum modelled explicitly.
- **Phase (swe-master):** P1 Architecture / P14 Data
- **Files / freeze boundary:** `backend/prisma/**`, `backend/prisma.config.ts`, `backend/package.json`, `backend/src/**`
- **Demo command:** `cd backend && npx prisma validate && npx tsc --noEmit && node --test`
- **Success criteria:** all three exit 0. Today the middle one exits 1 — `prisma@8.0.0-rc.12` against `@prisma/client@7.10.0` means `prisma/config` exports no `defineConfig`. Fixing that version mismatch is inside this milestone. At least one test must exist for `node --test` to pass.
- **Loops:** L1, L4
- **Skills:** canon + tdd + data-systems-engineering
- **Token budget:** 50000

### M2 — Query layer + revenue rollup
- **Outcome:** one module owns all reads (booking queue, mechanic load, customer lookup, revenue rollup); revenue is a SQL aggregate over the full filtered set, with an explicit statement timeout and bounded pool.
- **Phase:** P3 Backend / P14 Data
- **Files:** `frontend/lib/queries/**`, `backend/prisma/**`
- **Demo command:** `cd backend && node --test src/db/`
- **Success criteria:** tests green against seeded data, including one that asserts the revenue total over a filtered set does NOT equal the sum of the first page — the `revenue-aggregates-in-sql` invariant, made executable.
- **Loops:** L1, L3 (research: Connection-Pool-Management), L4
- **Skills:** canon + tdd + data-systems-engineering
- **Token budget:** 50000

### M3 — Dashboard read UI
- **Outcome:** `/dashboard` renders the booking queue, mechanic load and revenue rollup from real data, with a visible data-as-of timestamp and a per-panel error state.
- **Phase:** P2 Frontend
- **Files:** `frontend/app/dashboard/**`, `frontend/components/**`
- **Demo command:** `npm --prefix frontend run demo:m3`
- **Success criteria:** the `demo:m3` script (added by this milestone) builds, starts the server, curls `/dashboard`, asserts ≥1 `data-testid="booking-row"` and a rendered revenue figure, then exits non-zero if either is missing. A panel forced to fail must render an error state, not a blank.
- **Loops:** L1, L2, L4
- **Skills:** canon + **design-system skill (MANDATORY — frontend milestone)** + tdd + qa
- **Token budget:** 50000

### M4 — Staff auth gate
- **Outcome:** no anonymous access to any dashboard route; ops vs admin roles enforced server-side.
- **Phase:** P11 Security
- **Files:** `frontend/app/(auth)/**`, `frontend/middleware.ts`, `frontend/lib/auth/**`
- **Demo command:** `npm --prefix frontend run demo:m4`
- **Success criteria:** unauthenticated GET `/dashboard` redirects to login; authenticated ops GET returns 200; ops POST to an admin-only route (refund/export) returns 403 **from the server**, not merely a hidden button. Threat model written to `.genesis/decisions/`.
- **Loops:** L1, L4
- **Skills:** canon + security-engineering + tdd
- **Token budget:** 50000

### M5 — Request-a-mechanic dispatch (idempotent)
- **Outcome:** an operator can request/assign a mechanic against a booking; the write is idempotent and writes one append-only audit row.
- **Phase:** P3 Backend / P12 Reliability
- **Files:** `backend/src/dispatch/**`, `backend/prisma/**`, `frontend/app/dashboard/**`
- **Demo command:** `cd backend && node --test src/dispatch/`
- **Success criteria:** a test dispatches the same booking+mechanic twice and asserts exactly one assignment and one audit row survive, with the constraint enforced by the database (unique index), not app code. Booking status transitions validated against the state machine — an illegal transition throws.
- **Loops:** L1, L2, L4
- **Skills:** canon + production-readiness + tdd
- **Token budget:** 50000

<!-- duplicate the block per milestone -->

---

## Progress (loops append here on milestone completion — newest last)

- _(none yet — first loop fills this)_
