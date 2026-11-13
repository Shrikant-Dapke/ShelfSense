# API Overview

Base URL: `/api/v1`. All endpoints return
`{ success: true, data: T, meta? }` on success and
`{ success: false, error: { code, message, details? } }` on failure.

Session: JWT in an httpOnly cookie set by `POST /auth/login`. Send the cookie
with every request (the browser does this automatically).

List endpoints are paginated with `page` / `pageSize` (max 100) and return
`meta: { page, pageSize, total, totalPages }`.

## Roles

| Module | Action | ADMIN | MANAGER | OPERATOR |
| --- | --- | :-: | :-: | :-: |
| Auth | login / logout / me | ✅ | ✅ | ✅ |
| Products | read | ✅ | ✅ | ✅ |
| Products | create / update | ✅ | ✅ | ❌ |
| Products | delete (deactivate) | ✅ | ❌ | ❌ |
| Warehouses | read | ✅ | ✅ | ✅ |
| Warehouses | create / update / delete | ✅ | ❌ | ❌ |
| Inventory | read (list / summary / movements / balance) | ✅ | ✅ | ✅ |
| Inventory | adjust / transfer | ✅ | ✅ | ❌ |
| Receipts | read | ✅ | ✅ | ✅ |
| Receipts | create | ✅ | ✅ | ✅ |
| Dispatches | read | ✅ | ✅ | ✅ |
| Dispatches | create | ✅ | ✅ | ✅ |
| Batches | read | ✅ | ✅ | ✅ |
| Batches | create / update / aliases | ✅ | ✅ | ❌ |
| Stock counts | read | ✅ | ✅ | ✅ |
| Stock counts | create / update / submit | ✅ | ✅ | ✅ |
| Stock counts | approve / post | ✅ | ✅ | ❌ |
| Imports | read / preview | ✅ | ✅ | ✅ |
| Imports | upload / validate / execute | ✅ | ✅ | ❌ |
| Waste | read history / detail | ✅ | ✅ | ✅ |
| Waste | record | ✅ | ✅ | ✅ |
| Waste | summary (administrative) | ✅ | ✅ | ❌ |
| Reconciliation | read (list / overview) | ✅ | ✅ | ✅ |

## Auth (`/auth`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public (rate-limited) | Sets the session cookie |
| POST | `/auth/logout` | public | Clears the cookie |
| GET | `/auth/me` | any authenticated | Current session user |

## Products (`/products`)

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/products` | any authenticated |
| POST | `/products` | ADMIN, MANAGER |
| PATCH | `/products/:id` | ADMIN, MANAGER |
| DELETE | `/products/:id` | ADMIN (deactivate) |

## Warehouses (`/warehouses`)

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/warehouses` | any authenticated |
| POST | `/warehouses` | ADMIN |
| PATCH | `/warehouses/:id` | ADMIN |
| DELETE | `/warehouses/:id` | ADMIN (deactivate) |

## Inventory (`/inventory`)

All quantities are derived from the movement ledger.

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/inventory` | any | Ledger balances per warehouse/batch. Filters: `search`, `warehouseId`, `productId`, `batchId`, `category`, `expiryStatus` (SAFE/MONITOR/WARNING/CRITICAL/EXPIRED), `lowStock`; sort by product, batch code, expiry, quantity, warehouse |
| GET | `/inventory/summary` | any | Aggregates: `totalItems`, `totalMovements`, `pendingCounts`, `expiredBatches`; optional `warehouseId` scope |
| GET | `/inventory/movements` | any | Paginated ledger entries; filters: warehouse, batch, product, movement type, date range |
| GET | `/inventory/balance/:warehouseId/:batchId` | any | Single balance incl. expected/physical/variance |
| POST | `/inventory/adjust` | ADMIN, MANAGER | Signed ADJUSTMENT movement; rejects negative resulting stock; optional `idempotencyKey` |
| POST | `/inventory/transfer` | ADMIN, MANAGER | TRANSFER_OUT + TRANSFER_IN pair between warehouses; atomic; optional `idempotencyKey` |

## Receipts (`/receipts`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/receipts` | any | Paginated, filter by warehouse/supplier |
| GET | `/receipts/:id` | any | Includes items |
| POST | `/receipts` | ADMIN, MANAGER, OPERATOR | Creates/reuses canonical batches; writes RECEIPT movements; optional `idempotencyKey` |

## Dispatches (`/dispatches`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/dispatches` | any | Paginated, filter by warehouse/reference |
| GET | `/dispatches/:id` | any | Includes items |
| POST | `/dispatches` | ADMIN, MANAGER, OPERATOR | Validates availability, expiry and quarantine status; writes DISPATCH movements; optional `idempotencyKey` |

## Batches (`/batches`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/batches` | any | Filters: product, status, warehouse, `expiryStatus`, `search`; sorted by expiry by default |
| GET | `/batches/:id` | any | Includes aliases and ledger-derived stock |
| POST | `/batches` | ADMIN, MANAGER | Canonical batch creation |
| PATCH | `/batches/:id` | ADMIN, MANAGER | Status (ACTIVE/QUARANTINED/RECALLED), expiry, supplier |
| POST | `/batches/:id/aliases` | ADMIN, MANAGER | Warehouse-scoped external code (unique per warehouse) |

## Stock counts (`/stock-counts`)

Lifecycle: `PENDING` (draft) → `SUBMITTED` → `APPROVED` → `POSTED`.

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/stock-counts` | any | Paginated history, filter by warehouse/status |
| GET | `/stock-counts/:id` | any | Includes item-level expected/counted/variance |
| POST | `/stock-counts` | ADMIN, MANAGER, OPERATOR | Draft; expected quantities snapshot from the ledger |
| PATCH | `/stock-counts/:id` | ADMIN, MANAGER, OPERATOR | Edit while still a draft |
| POST | `/stock-counts/:id/submit` | ADMIN, MANAGER, OPERATOR | |
| POST | `/stock-counts/:id/approve` | ADMIN, MANAGER | Records approver + time |
| POST | `/stock-counts/:id/post` | ADMIN, MANAGER | Recomputes expected balances under row locks; writes signed ADJUSTMENT movements; refuses negative results; duplicate posts conflict |

## Imports (`/imports`)

CSV pipeline: **upload → preview/validate → execute** (execution is explicit).

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/imports` | any | Job history with status |
| GET | `/imports/:id` | any | Job incl. per-row errors |
| GET | `/imports/:id/preview` | any | Parsed rows + validation results |
| POST | `/imports/upload` | ADMIN, MANAGER | Multipart; `importType` = `PRODUCTS` \| `OPENING_STOCK` (+ `warehouseId` for opening stock); CSV only |
| POST | `/imports/:id/validate` | ADMIN, MANAGER | Runs full row validation, marks job `VALIDATED` |
| POST | `/imports/:id/execute` | ADMIN, MANAGER | Applies the import. Opening stock creates receipts through the standard ledger workflow; the job id doubles as the receipt idempotency key so re-execution conflicts |

Partial failures are reported per row: valid rows can complete while invalid
rows are listed in the job result.

## Waste (`/waste`)

Every record creates an immutable `WASTE` stock movement in the ledger; the
record and the movement are written atomically (commit or roll back together)
and linked via `relatedStockMovementId`. The batch row is locked and the
available balance is recalculated from the ledger under the lock, so recording
waste can never drive stock negative. Expired and quarantined stock may be
wasted; quantities use `NUMERIC(19,4)` precision. Product identity flows
through the batch (there is no product column on `waste_records`).

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/waste` | any | Paginated history; filters: `warehouseId`, `batchId`, `productId`, `reason` (EXPIRED/DAMAGED/SPOILED/LOST/OTHER), `fromDate`/`toDate`, `search` (product, SKU, batch code, notes) |
| GET | `/waste/summary` | ADMIN, MANAGER | Totals plus breakdowns by reason and warehouse over an optional warehouse/date window; reconciles exactly with the `WASTE` ledger movements |
| GET | `/waste/:id` | any | Waste record detail incl. batch/product/warehouse context. (`/summary` is registered before `/:id`) |
| POST | `/waste` | ADMIN, MANAGER, OPERATOR | Requires warehouse, product, batch, positive quantity ≤ available (recalculated under lock) and a reason; optional `notes`, `recordedAt`, `idempotencyKey` (replayed keys conflict with 409); audited as `waste.recorded` |

## Reconciliation (`/reconciliation`)

Strictly read-only visibility into cross-warehouse inventory distribution
and inconsistencies. Every quantity is derived from the immutable movement
ledger via the shared balance helper; nothing here writes stock, merges
batches/aliases, or infers batch identity from similar-looking codes.
Corrections are made exclusively through the governed operations
(`POST /inventory/adjust`, `POST /inventory/transfer`, stock-count posting),
which the reconciliation UI exposes for ADMIN/MANAGER.

Per canonical batch the list returns: product info, per-warehouse
ledger-derived balances, total across warehouses, expiry date/status,
warehouse-scoped aliases, the 5 most recent ledger movements, open
stock-count variances (submitted/approved, not yet posted), and derived
conditions: `MULTI_WAREHOUSE` (stock in >1 warehouse), `MULTI_ALIAS`
(batch known under different warehouse codes), `EXPIRED_STOCK` (expired
while holding stock), `OPEN_VARIANCE`, `INCONSISTENT` (non-active batch
holding stock, or a negative ledger balance).

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/reconciliation` | any | Paginated per-batch rows; filters: `warehouseId`, `productId`, `batchId`, `condition`, `expiryStatus`, `search` (canonical code, alias code, product name/SKU); sort incl. `totalQuantity`. Batches with movement history but zero balance are shown (real zero stock); batches without history are absent (missing data, not zero). Condition/expiry/totalQuantity filters scan candidate batches and paginate exactly in memory |
| GET | `/reconciliation/overview` | any | Global (or `warehouseId`-scoped) counts: total ledger quantity, batches with stock, multi-warehouse, expired-stock and open-variance batch counts; reconciles exactly with the movement ledger |
