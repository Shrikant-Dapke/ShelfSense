# Architecture

## Stack

- **Server**: Node ≥ 20, Express 5, Prisma ORM + PostgreSQL, Zod validation, JWT session cookie, Helmet, CORS, rate limiting, pino logging.
- **Client**: Next.js (App Router), React 19, TanStack Query v5, Tailwind CSS 4, shadcn/ui components, Sonner toasts. The client never talks to the database; it consumes the REST API through a same-origin rewrite proxy.

## The movement ledger (core design decision)

There is **no mutable stock quantity anywhere**. Every quantity change is an
append-only row in `stock_movements`:

```
stock_movements: id, warehouseId, batchId, movementType, quantity (signed where applicable),
                 referenceId, idempotencyKey (unique), occurredAt, createdBy
```

Movement types: `RECEIPT`, `DISPATCH`, `WASTE`, `TRANSFER_IN`, `TRANSFER_OUT`,
`ADJUSTMENT` (stored signed). A balance is always *calculated* by replaying the
movements for a (warehouse, batch) pair — `calculateBalanceFromMovements()` in
`server/src/modules/inventory/inventory.repository.ts` is the single
implementation. This gives:

- a complete audit trail for free (balances and history are the same data),
- no lost-update anomalies on a mutable counter,
- reconciliation is trivially possible (sum of movements == displayed balance).

## Concurrency & locking strategy

Every operation that mutates stock follows the same convention:

1. Open a single interactive Prisma transaction (`prisma.$transaction`).
2. **Row-lock the batch row(s)** with `SELECT … FOR UPDATE` (`batches` table).
3. **Recalculate the expected balance from the ledger after acquiring the
   lock** — never trust a balance read before the lock.
4. Validate against negative stock (dispatch, negative adjustment) and write
   the movement(s).

Multi-batch operations (multi-item receipts, stock-count posting) pre-lock all
batch rows **in sorted `batchId` order** before processing items, which makes
concurrent multi-batch transactions serialize in a deterministic order instead
of deadlocking (two transactions each holding a batch the other needs).

Lock coverage by operation:

| Operation | Locks |
| --- | --- |
| Receipt | sorted pre-lock of all pre-existing batches; per-item re-lock (covers batches created in the same transaction) |
| Dispatch | single batch row per item |
| Adjustment / Transfer | single batch row (transfer: source warehouse lock + single batch) |
| Stock count posting | count row `FOR UPDATE` (serializes duplicate posts) + sorted pre-lock of all counted batch rows |
| Import execution (opening stock) | flows through the same receipts workflow, inheriting its locking |

Known theoretical residue: the **dispatch** module locks its batch rows
sequentially in item order without sorted pre-locking, so a dispatch sharing
batches with another multi-batch operation in a conflicting order could
deadlock in theory. It has not been observed; see
[development.md limitations](development.md#known-limitations).

## Idempotency

Write endpoints accept an optional client `idempotencyKey` backed by a unique
constraint on `stock_movements.idempotencyKey` (and on receipts/dispatches
rows):

- receipts: `<key>_item_<idx>` per movement
- dispatches: `<key>_item_<idx>`
- transfers: `<key>_out` / `<key>_in`
- adjustments: the key itself
- stock count posting: `<countId>_adj_<itemId>`
- import execution: the job id becomes the receipt idempotency key

Duplicate submissions replayed with the same key fail with `409 CONFLICT`
instead of double-counting.

## Authentication & RBAC

- Login compares against bcrypt hashes (with a dummy-hash compare when the
  user does not exist, to keep timing uniform) and issues a JWT wrapped in an
  httpOnly, `SameSite=Lax` cookie (`secure` in production), expiry configurable
  via `JWT_EXPIRES_IN_HOURS`.
- Routes require a session (`requireAuth`); mutating routes additionally
  declare roles (`requireRoles(...)`). Validation middleware (`validate`) runs
  a Zod schema per route — body, query or params — and rejects unknown
  structures with `422`.
- Full RBAC matrix: [api.md](api.md#roles).

## Data model

Core entities: `users`, `warehouses`, `products`, `batches`,
`batch_aliases` (unique per warehouse + normalized external code), and the
operational children `stock_movements`, `receipts`/`receipt_items`,
`dispatches`/`dispatch_items`, `stock_counts`/`stock_count_items`,
`waste_records`, `import_jobs`, `audit_logs`.

- All quantities are `DECIMAL(19,4)` in Postgres (`Prisma.Decimal` in code);
  floats never touch the ledger.
- Foreign keys: `RESTRICT` on core references (products, warehouses, batches),
  `CASCADE` on child rows (items, aliases, movements reference integrity).
- Unique constraints enforce business invariants (batch code per product,
  alias per warehouse, one count item per batch, idempotency keys).
- Composite indexes cover the hot queries (balance replay by
  `warehouseId+batchId`, expiry listing, audit lookups).

## Client architecture

- `src/lib/api-client.ts` — typed `fetch` wrapper that unwraps the
  `{ success, data, meta }` envelope and throws `ApiClientError` (code,
  message, field details) on failures.
- `src/features/*-api.ts` — per-module typed API functions.
- Pages are React client components using TanStack Query. Global defaults:
  `staleTime` 30 s, `refetchOnWindowFocus` false. Every mutation invalidates
  the query keys of every view it can affect (lists, details, inventory,
  batches) so cross-page views stay consistent.
- Auth state lives in a small context backed by the `["auth","me"]` query; the
  app layout redirects to `/login` when the session cookie is invalid/expired.
- RBAC: role-gated actions are hidden client-side **and** enforced server-side;
  the server is the authority.

## Testing

- **Server**: Vitest integration tests (`server/tests/integration/`) run
  against the real `shelfsense_test` PostgreSQL database — migrations are
  deployed by `globalSetup`, tables are truncated between tests, users are
  seeded per file. No mocks for the critical paths. Includes concurrency tests
  (parallel posts of the same count, parallel receipts/adjustments), a
  lock-ordering/deadlock regression, idempotency replay tests, and one
  continuous end-to-end workflow test covering every module and a final
  ledger reconciliation.
- **Client**: Vitest + React Testing Library (`client/src/**/*.test.{ts,tsx}`)
  covering the API error contract and the login workflow. Pages are otherwise
  verified by typecheck, production build, and the server integration suite.

## Error handling

Errors flow through a central middleware and serialize as
`{ success: false, error: { code, message, details? } }`. Stack traces are only
included in development. The client maps `ApiClientError` messages directly to
toasts — backend errors are surfaced verbatim, never swallowed.
