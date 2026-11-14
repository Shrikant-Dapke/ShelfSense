import { can, type PermissionAction } from "@/features/auth/permissions";
import type { SessionUser } from "@/lib/types";
import type { ExpiryListRow, ExpiryMonitor } from "@/features/expiry-api";
import type { StockCountView } from "@/features/inventory-api";
import type { Paginated } from "@/features/inventory-api";

/**
 * Pure dashboard logic, extracted so the permission and ordering rules are
 * unit-testable without rendering the page. Every value here is derived from
 * existing endpoints (`/expiry/monitor`, `/analytics/summary`,
 * `/stock-counts`) — nothing is invented and no new endpoint is required.
 */

// ---------- KPI derivation ----------

/**
 * Near-expiry batch count using the agreed expiry classification
 * (server/src/utils/expiry.ts): CRITICAL is DTE 1-6, WARNING is DTE 7-14.
 * MONITOR (15-30) is a separate watchlist, not "near-expiry".
 */
export function nearExpiryBatchCount(
  monitor: ExpiryMonitor | null | undefined,
): number | undefined {
  if (!monitor) return undefined;
  return monitor.buckets.CRITICAL.batches + monitor.buckets.WARNING.batches;
}

/**
 * Pending stock-count tasks = drafts (PENDING) + submitted (awaiting
 * review). Computed from the two list queries' meta totals. If either list
 * failed to load the combined value is unavailable (undefined), never a
 * partial sum presented as complete.
 */
export function pendingCountTaskTotal(
  pending: Paginated<StockCountView> | undefined,
  submitted: Paginated<StockCountView> | undefined,
): number | undefined {
  if (!pending || !submitted) return undefined;
  return pending.meta.total + submitted.meta.total;
}

/**
 * Estimated value at risk (expiry monitor totals). Returns:
 * - undefined            -> data not loaded yet (caller shows skeleton)
 * - null                 -> at-risk stock exists but none of it has cost
 *                           data; a fabricated zero would be a lie
 * - number (may be 0)    -> real zero when there is nothing at risk, or the
 *                           actual estimated value otherwise
 */
export function valueAtRisk(
  monitor: ExpiryMonitor | null | undefined,
): number | null | undefined {
  if (!monitor) return undefined;
  if (monitor.totals.quantityWithCost === 0 && monitor.totals.totalQuantity > 0) {
    return null;
  }
  return monitor.totals.estimatedValueAtRisk;
}

// ---------- Needs Attention: near-expiry batches ----------

/**
 * Top near-expiry (batch, warehouse) rows for the worklist. The server
 * already returns `atRisk` sorted most-urgent-first (daysToExpiry asc,
 * DTE 1-30) and only positive balances — this slice preserves that order.
 */
export function topNearExpiryRows(
  monitor: ExpiryMonitor | null | undefined,
  limit = 5,
): ExpiryListRow[] {
  if (!monitor) return [];
  return monitor.atRisk
    .filter((row) => row.availableQuantity > 0)
    .slice(0, limit);
}

export interface RowAction {
  label: string;
  href: string;
}

/**
 * Worklist actions for one near-expiry row. Dispatch is NEVER offered for
 * expired, quarantined or recalled stock — the backend re-validates this on
 * POST /dispatches, but the dashboard must not even suggest it. Waste is
 * always offered: the waste module explicitly exists to write off expired
 * and quarantined/recalled stock.
 */
export function nearExpiryRowActions(row: ExpiryListRow): RowAction[] {
  const actions: RowAction[] = [];
  if (row.batchStatus === "ACTIVE" && row.expiryStatus !== "EXPIRED") {
    actions.push({ label: "Dispatch", href: "/dispatch" });
  }
  actions.push({ label: "Record waste", href: "/waste" });
  return actions;
}

// ---------- Needs Attention: pending stock counts ----------

/**
 * Deterministic worklist ordering for pending counts: SUBMITTED rows first
 * (someone is waiting for review/approval), then drafts; oldest first within
 * each group, id as the stable tie-break. Capped at `limit` rows.
 */
export function mergePendingCounts(
  pending: StockCountView[] | undefined,
  submitted: StockCountView[] | undefined,
  limit = 5,
): StockCountView[] {
  const byCreatedAsc = (a: StockCountView, b: StockCountView) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  return [
    ...(submitted ?? []).slice().sort(byCreatedAsc),
    ...(pending ?? []).slice().sort(byCreatedAsc),
  ].slice(0, limit);
}

// ---------- Quick actions ----------

export interface QuickActionDef {
  key: "receipt" | "dispatch" | "waste" | "count" | "product" | "import";
  label: string;
  description: string;
  href: string;
  permission: PermissionAction;
}

/** All candidate quick actions; visibility is decided by `can()`. */
export const QUICK_ACTIONS: QuickActionDef[] = [
  {
    key: "receipt",
    label: "Receive stock",
    description: "Log inbound goods into inventory",
    href: "/receipts",
    permission: "receipt.create",
  },
  {
    key: "dispatch",
    label: "Create dispatch",
    description: "Pick and ship stock out",
    href: "/dispatch",
    permission: "dispatch.create",
  },
  {
    key: "waste",
    label: "Record waste",
    description: "Write off expired or damaged stock",
    href: "/waste",
    permission: "waste.record",
  },
  {
    key: "count",
    label: "New stock count",
    description: "Start a physical count",
    href: "/stock-counts",
    permission: "count.create",
  },
  {
    key: "product",
    label: "New product",
    description: "Add to the catalogue",
    href: "/products",
    permission: "product.create",
  },
  {
    key: "import",
    label: "New import",
    description: "Bulk upload CSV/XLSX",
    href: "/imports",
    permission: "import.upload",
  },
];

/** Role-aware quick actions — only actions the user's role can perform. */
export function quickActionsFor(
  user: Pick<SessionUser, "role"> | null | undefined,
): QuickActionDef[] {
  return QUICK_ACTIONS.filter((action) => can(user, action.permission));
}

// ---------- Warehouse overview ----------

export interface WarehouseSummaryRow {
  warehouseId: string;
  name: string;
  code: string;
  totalQuantity: number;
  criticalQuantity: number;
  warningQuantity: number;
  expiredQuantity: number;
}

/**
 * Compact warehouse summaries from the expiry monitor's per-warehouse
 * breakdown (which aggregates every positive ledger balance, not just
 * at-risk stock). Warehouses with no positive balance don't appear in the
 * breakdown and are not fabricated as zeros here.
 */
export function warehouseSummaries(
  monitor: ExpiryMonitor | null | undefined,
): WarehouseSummaryRow[] {
  if (!monitor) return [];
  return monitor.warehouses.map((w) => ({
    warehouseId: w.warehouseId,
    name: w.warehouseName,
    code: w.warehouseCode,
    totalQuantity: w.totalQuantity,
    criticalQuantity: w.buckets.CRITICAL,
    warningQuantity: w.buckets.WARNING,
    expiredQuantity: w.buckets.EXPIRED,
  }));
}
