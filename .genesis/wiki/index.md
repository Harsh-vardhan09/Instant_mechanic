# Wiki Index — instant-mechanic

The project knowledge base. Same schema as the agentic-swe-kit wiki: concept pages in `concepts/`,
each with frontmatter and ≥2 `[[wikilinks]]`. The L3 RESEARCH loop writes here; G0 reads here first.

> **Read this file before any milestone (G0 step 1).** Pick candidate pages by name-matching the
> milestone's nouns, then drill in. The wiki is what prevents rebuilding work that already exists.

## Entities (the things this system has)
<!-- stubs — fill as the schema lands in M1 -->
- `Booking` — a vehicle-service job. Has a status lifecycle (the state machine P3 gate demands). Not yet modelled.
- `Mechanic` — a person who can be dispatched. Has availability and current load. Not yet modelled.
- `Customer` — the person who owns the vehicle. Holds the PII the trust boundary protects. Not yet modelled.
- `Payment` — what revenue rollups sum over. Not yet modelled.
- `AuditEntry` — append-only record of an operator action. Required by the P11 gate. Not yet modelled.

## Concepts (how it works)
<!-- - [[concepts/<Concept>]] — one-line summary -->
- _(none yet — L3 RESEARCH writes here)_

## Sources (research distilled by L3)
- _(none yet)_

## Seeded from agentic-swe-kit
Pointers only — read on demand. `$AGENTIC_SWE_WIKI_ROOT` = `~/.agentic-swe-kit/wiki`.

**Boundaries & structure — read before M1/M2 (deciding where the query layer sits)**
- `$AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Boundary-Lines.md` — where to cut the seam between dashboard UI and data access
- `$AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Database-as-Detail-The-database-is-a-low-level-mechanism-like-a-doorknob-that-do.md` — why Prisma should not leak into pages (backs the `ui-never-imports-prisma` invariant)
- `$AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Business-Rules.md` — what belongs in the booking state machine vs the UI
- `$AGENTIC_SWE_WIKI_ROOT/pragmatic-programmer/concepts/Design-by-Contract.md` — preconditions on dispatch

**Data & queries — read before M2 (revenue rollups)**
- `$AGENTIC_SWE_WIKI_ROOT/designing-data-intensive-applications/concepts/OLTP-vs-OLAP-and-Columnar-Storage.md` — a dashboard runs analytical queries against an OLTP schema; this is the tension to manage
- `$AGENTIC_SWE_WIKI_ROOT/designing-data-intensive-applications/concepts/Data-Models-and-Query-Languages.md` — modelling bookings/mechanics/customers
- `$AGENTIC_SWE_WIKI_ROOT/designing-data-intensive-applications/concepts/Transactions-and-Isolation.md` — backs the `dispatch-is-idempotent` invariant; read before M5
- `$AGENTIC_SWE_WIKI_ROOT/designing-data-intensive-applications/concepts/Encoding-and-Schema-Evolution.md` — backs the P14 backward-compatibility gate

**Production behaviour — read before M2/M5 (Supabase is over the public internet)**
- `$AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Integration-Points.md` — the Supabase connection is an integration point, the #1 source of production failure
- `$AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Connection-Pool-Management.md` — serverless Next.js + Postgres is a known pool-exhaustion trap
- `$AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Circuit-Breaker.md` — backs the `every-db-call-has-a-timeout` invariant
- `$AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Fail-Fast.md` — how a panel should die visibly rather than hang

**Trust boundary — read before M4**
- `$AGENTIC_SWE_WIKI_ROOT/security-engineering/concepts/Access-Control.md` — ops vs admin RBAC, enforced server-side
- `$AGENTIC_SWE_WIKI_ROOT/security-engineering/concepts/Privacy-and-Inference-Control.md` — customer PII behind the dashboard; what ops may see and export
