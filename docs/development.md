# Development Guide

## Prerequisites

- Node.js ≥ 20
- PostgreSQL (a local instance is enough)
- pnpm v11 (workspace package manager)

## Setup

```bash
pnpm install                       # installs server + client deps
cp server/.env.example server/.env # then edit DATABASE_URL, JWT_SECRET
cp client/.env.example client/.env # API_PROXY_TARGET (default ok)
pnpm --filter @shelfsense/server db:deploy   # apply migrations
pnpm --filter @shelfsense/server db:seed     # create admin + sample data
pnpm dev:server                    # terminal 1 → http://localhost:4000
pnpm dev:client                    # terminal 2 → http://localhost:3000
```

Environment variables:

| Variable | Where | Meaning |
| --- | --- | --- |
| `PORT` | server | Express port (default 4000) |
| `DATABASE_URL` | server | PostgreSQL connection string (**required**) |
| `JWT_SECRET` | server | Signing key, min 16 chars (**required**) |
| `JWT_EXPIRES_IN_HOURS` | server | Session lifetime (default 8) |
| `CORS_ORIGINS` | server | Comma-separated allowed origins |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | server | Seed credentials |
| `API_PROXY_TARGET` | client | Rewrite target for `/api/v1/*` (default `http://localhost:4000`) |

Both packages fail fast with a clear error when required variables are missing
or malformed (Zod-validated env in `server/src/config/env.ts`).

## Database migrations

- **Apply to any database**: `pnpm --filter @shelfsense/server db:deploy`
  (`prisma migrate deploy`). This is the safe command for both the dev DB and
  any future staging/production DB — it never resets data.
- `prisma migrate dev` (the `db:migrate` script) expects to checksum-match the
  local migration history. On Windows checkouts with CRLF line endings the
  checksum can drift and Prisma may demand a database reset — in that situation
  use `db:deploy`, which is checksum-tolerant.
- Do **not** run `prisma migrate reset` against your development database.
- Migration history lives in `server/prisma/migrations/`. Current migrations:
  1. `init_foundation` — users, warehouses, products, audit log
  2. `inventory_engine` — batches, aliases, movements, receipts, dispatches
  3. `receipt_dispatch_idempotency` — idempotency keys + constraints
  4. `stock_count_posting` — stock counts and items
  5. `import_infrastructure` — import jobs

## Testing

```bash
# Server integration suite (real PostgreSQL, database "shelfsense_test")
pnpm test:server

# Watch mode
pnpm --filter @shelfsense/server test:watch

# Client tests (Vitest + React Testing Library)
pnpm --filter @shelfsense/client test
```

Notes:

- The server suite auto-deploys migrations into `shelfsense_test` via
  `globalSetup` and truncates operational tables between tests; it never
  touches the development database (`shelfsense`).
- Tests run sequentially in a single Vitest fork — they share one database and
  rely on deterministic cleanup.
- `tests/integration/e2e-workflow.test.ts` walks the entire product journey
  (login/RBAC → product + warehouse → receipt → alias → inventory → dispatch →
  stock count post → CSV import) and finally replays the movement ledger to
  prove balances reconcile.
- `tests/integration/stockcounts.test.ts` includes a concurrency regression
  that posts two approved counts sharing batches in opposite item order and
  asserts both serialize (sorted lock ordering) instead of deadlocking.

## Code layout

```
server/
  src/
    app.ts               # express app: helmet, CORS, rate limit, routers
    config/              # env (zod), prisma client, logger
    middleware/          # auth (session+RBAC), validation, error handler
    modules/<module>/    # routes -> controller -> service -> repository
    utils/               # jwt, password, api-error, pagination helpers
  prisma/
    schema.prisma
    migrations/
    seed.ts
  tests/
    helpers.ts           # app, db reset, seeded users, login helper
    integration/         # one file per module + e2e-workflow
client/
  src/
    app/                 # Next.js App Router pages (route groups: (app), login)
    components/          # shadcn/ui primitives + layout sidebar
    features/            # typed API modules + auth context
    lib/                 # api-client (envelope + error mapping), utils
  tests are colocated:   src/**/*.test.{ts,tsx}
```

Module convention (server): routes declare auth/RBAC/validation; controllers
are thin; services own business rules and transactions; repositories do data
access. Every mutation writes an audit log entry.

## Client conventions

- Pages are `"use client"` components using TanStack Query; global
  `staleTime` is 30 s, so **every mutation must invalidate every query key it
  can affect** (its own list, detail keys, and cross-cutting views like
  `["inventory"]`, `["batches"]`).
- Errors are surfaced verbatim from the backend via `ApiClientError` → Sonner
  toasts. Never replace a backend message with a generic success.
- Role-gated actions are hidden in the UI (e.g. create buttons) but the server
  remains the authority — the client gate is UX only.
- Loading states use skeletons; zero is always rendered as a real zero, never
  a fabricated placeholder.

## Verification checklist (before committing)

```bash
pnpm test:server                              # full integration suite
pnpm --filter @shelfsense/client test         # client unit tests
pnpm build:server                             # tsc production build
pnpm --filter @shelfsense/client exec tsc --noEmit   # client typecheck
pnpm build:client                             # next build
pnpm --filter @shelfsense/server exec prisma migrate deploy   # migration status
```

## Known limitations

Documented honestly as of Milestone 3-F (Milestone 3 complete):

- **Not production-ready.** No deployment pipeline, no infrastructure config,
  no load testing. The security posture covers development and single-instance
  operation (Helmet, rate limiting on login only, per-process JWT secret).
- **Placeholders.** Only the Settings frontend section remains an intentional
  placeholder. All M3 modules (waste, reconciliation, expiry, FEFO
  recommendations, analytics) are fully functional.
- **Dispatch lock ordering — resolved in Milestone 3-A.** Dispatches now
  pre-lock all batch rows in sorted `batchId` order (same pattern as receipts
  and stock-count posting), with a concurrency regression test proving two
  multi-item dispatches sharing batches in opposite item order both complete
  and reconcile. The seven whitespace-only dispatch diffs preserved during
  M2 Phase H were explicitly discarded (with approval) before this fix so the
  commit contains only the functional change.
- **Inventory adjust/transfer have no UI** — they are API-only.
- **Imports are CSV-only** and limited to `PRODUCTS` and `OPENING_STOCK`.
- **No pagination-infinite lists / virtualization**; tables cap at 100 rows
  per page, which is fine at current data volumes.
- **Client test coverage is minimal** (API error contract + login workflow);
  broader page-level coverage would need more infrastructure than Phase H
  scope allowed.
- **No automated end-to-end browser tests** (e.g. Playwright) — the browser
  journey was verified manually against a live server during development.
