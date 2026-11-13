# ShelfSense

Smarter Inventory. Less Waste. Better Distribution.

ShelfSense is an inventory management application for perishable goods. Every
quantity in the system is derived from an **immutable movement ledger** — there
are no mutable stock columns — which makes balances auditable and concurrency
safe by design.

## Repository layout

This is a pnpm workspace with two packages:

| Package | Path | Description |
| --- | --- | --- |
| `@shelfsense/server` | `server/` | Express + Prisma REST API (Node ≥ 20) |
| `@shelfsense/client` | `client/` | Next.js App Router frontend (React 19, TanStack Query, Tailwind CSS 4, shadcn/ui) |

## Quick start

Prerequisites: **Node.js ≥ 20** and **PostgreSQL** running locally. `pnpm` is
the workspace package manager (v11).

```bash
# 1. Install everything (workspace root)
pnpm install

# 2. Configure the server environment
cp server/.env.example server/.env
#    -> set DATABASE_URL and a long random JWT_SECRET

# 3. Configure the client environment
cp client/.env.example client/.env
#    -> API_PROXY_TARGET defaults to http://localhost:4000

# 4. Apply migrations and seed an admin user
pnpm --filter @shelfsense/server db:deploy
pnpm --filter @shelfsense/server db:seed

# 5. Run both apps (in separate terminals)
pnpm dev:server   # Express on http://localhost:4000
pnpm dev:client   # Next.js on http://localhost:3000
```

The client proxies all `/api/v1/*` requests to the server (`API_PROXY_TARGET`),
so the httpOnly session cookie stays same-origin. Log in with the seeded admin
(`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, default `admin@shelfsense.local` /
`Admin123!`).

## Commands

| Task | Command |
| --- | --- |
| Server dev | `pnpm dev:server` |
| Client dev | `pnpm dev:client` |
| Server tests (integration, real DB) | `pnpm test:server` |
| Client tests (Vitest + Testing Library) | `pnpm --filter @shelfsense/client test` |
| Production builds | `pnpm build:server` / `pnpm build:client` |
| Apply migrations | `pnpm --filter @shelfsense/server db:deploy` |
| Seed | `pnpm --filter @shelfsense/server db:seed` |

See [docs/development.md](docs/development.md) for the full workflow,
[docs/architecture.md](docs/architecture.md) for how the system is put
together, and [docs/api.md](docs/api.md) for the endpoint overview.

## Modules

- **Authentication** — session cookie (JWT), role-based access control (ADMIN / MANAGER / OPERATOR)
- **Products & Warehouses** — catalogue and location management
- **Receipts** — goods received; creates or reuses canonical batches and writes RECEIPT movements
- **Dispatches** — stock issued out; validates availability and expiry/quarantine rules, writes DISPATCH movements
- **Batches & Aliases** — canonical batch codes plus warehouse-scoped external (supplier) alias codes
- **Inventory** — ledger-derived balances, movement history, adjustments and transfers (API)
- **Stock Counts** — draft → submit → approve → post lifecycle; posting writes signed ADJUSTMENT movements
- **Imports** — CSV upload → preview → validate → explicit execute (products and opening stock); execution flows through the same receipts ledger
- **Audit log** — every mutation records who did what

## Documentation

- [Architecture](docs/architecture.md) — ledger design, locking, auth, data model
- [API overview](docs/api.md) — modules, endpoints, roles
- [Development guide](docs/development.md) — setup, migrations, testing, limitations

## Status & limitations

This project is at **Milestone 3-D** (ledger, receiving, dispatch, batches,
stock counts, imports, frontend integration, deterministic dispatch locking,
food waste management, inventory reconciliation, expiry intelligence). It is
**not** production-ready: there is no deployment pipeline or hardening beyond
development defaults, and the remaining frontend sections (Analytics,
Settings) are intentional placeholders for later milestones. See
[docs/development.md](docs/development.md#known-limitations) for the complete,
honest list.
