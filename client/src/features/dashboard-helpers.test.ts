import { describe, expect, it } from "vitest";
import {
  mergePendingCounts,
  nearExpiryBatchCount,
  nearExpiryRowActions,
  pendingCountTaskTotal,
  quickActionsFor,
  topNearExpiryRows,
  valueAtRisk,
  warehouseSummaries,
} from "./dashboard-helpers";
import type { ExpiryListRow, ExpiryMonitor } from "@/features/expiry-api";
import type { StockCountView } from "@/features/inventory-api";
import type { Paginated } from "@/features/inventory-api";

// Pure dashboard rules: KPI derivation (real zero vs unavailable), worklist
// ordering and safety (never dispatch expired/quarantined/recalled stock),
// pending-count visibility, and role-filtered quick actions.

const users = {
  admin: { id: "u1", name: "Ada Admin", email: "a@x", role: "ADMIN" as const },
  manager: { id: "u2", name: "Malik Manager", email: "m@x", role: "MANAGER" as const },
  operator: { id: "u3", name: "Ola Operator", email: "o@x", role: "OPERATOR" as const },
};

function makeMonitor(overrides: Partial<ExpiryMonitor> = {}): ExpiryMonitor {
  const emptyBuckets = () => ({
    SAFE: { batches: 0, totalQuantity: 0 },
    MONITOR: { batches: 0, totalQuantity: 0 },
    WARNING: { batches: 0, totalQuantity: 0 },
    CRITICAL: { batches: 0, totalQuantity: 0 },
    EXPIRED: { batches: 0, totalQuantity: 0 },
  });
  return {
    buckets: emptyBuckets(),
    totals: {
      batchesWithStock: 0,
      totalQuantity: 0,
      estimatedValueAtRisk: 0,
      quantityWithCost: 0,
      quantityWithoutCost: 0,
    },
    warehouses: [],
    atRisk: [],
    expired: [],
    ...overrides,
  };
}

function makeRow(overrides: Partial<ExpiryListRow> = {}): ExpiryListRow {
  return {
    batchId: "b1",
    canonicalCode: "LOT-1",
    batchStatus: "ACTIVE",
    productId: "p1",
    productName: "Product P",
    productSku: "SKU-1",
    productUnit: "L",
    warehouseId: "w1",
    warehouseName: "Main Warehouse",
    warehouseCode: "WH-1",
    expiryDate: "2026-11-20T00:00:00.000Z",
    daysToExpiry: 6,
    expiryStatus: "CRITICAL",
    availableQuantity: 10,
    estimatedValue: null,
    unitCost: null,
    ...overrides,
  };
}

function makeCount(overrides: Partial<StockCountView> = {}): StockCountView {
  return {
    id: "c1",
    warehouseId: "w1",
    warehouseName: "Main Warehouse",
    warehouseCode: "WH-1",
    status: "PENDING",
    referenceNo: null,
    description: null,
    countedAt: null,
    countedByName: null,
    approvedByName: null,
    approvedAt: null,
    postedByName: null,
    postedAt: null,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    items: [],
    totalExpectedQuantity: 0,
    totalCountedQuantity: 0,
    totalVariance: 0,
    ...overrides,
  };
}

function makePage(items: StockCountView[], total: number): Paginated<StockCountView> {
  return { items, meta: { page: 1, pageSize: 5, total, totalPages: 1 } };
}

describe("nearExpiryBatchCount", () => {
  it("is unavailable while the monitor has not loaded", () => {
    expect(nearExpiryBatchCount(null)).toBeUndefined();
    expect(nearExpiryBatchCount(undefined)).toBeUndefined();
  });

  it("sums the CRITICAL and WARNING batch counts only (DTE 1-14)", () => {
    const monitor = makeMonitor({
      buckets: {
        SAFE: { batches: 9, totalQuantity: 0 },
        MONITOR: { batches: 4, totalQuantity: 0 },
        WARNING: { batches: 3, totalQuantity: 0 },
        CRITICAL: { batches: 2, totalQuantity: 0 },
        EXPIRED: { batches: 1, totalQuantity: 0 },
      },
    });
    expect(nearExpiryBatchCount(monitor)).toBe(5);
  });

  it("treats zero at-risk batches as a real zero", () => {
    expect(nearExpiryBatchCount(makeMonitor())).toBe(0);
  });
});

describe("pendingCountTaskTotal", () => {
  it("is unavailable when either list has not loaded", () => {
    expect(pendingCountTaskTotal(undefined, makePage([], 2))).toBeUndefined();
    expect(pendingCountTaskTotal(makePage([], 3), undefined)).toBeUndefined();
  });

  it("sums drafts + submitted from the list meta totals", () => {
    expect(pendingCountTaskTotal(makePage([], 2), makePage([], 3))).toBe(5);
  });

  it("treats two empty lists as a real zero", () => {
    expect(pendingCountTaskTotal(makePage([], 0), makePage([], 0))).toBe(0);
  });
});

describe("valueAtRisk — real zero vs unavailable", () => {
  it("is unavailable while the monitor has not loaded", () => {
    expect(valueAtRisk(null)).toBeUndefined();
    expect(valueAtRisk(undefined)).toBeUndefined();
  });

  it("is null (em dash) when stock exists but has no cost data", () => {
    const monitor = makeMonitor({
      totals: {
        batchesWithStock: 2,
        totalQuantity: 95,
        estimatedValueAtRisk: 0,
        quantityWithCost: 0,
        quantityWithoutCost: 95,
      },
    });
    expect(valueAtRisk(monitor)).toBeNull();
  });

  it("is a real zero when there is no stock at risk at all", () => {
    expect(valueAtRisk(makeMonitor())).toBe(0);
  });

  it("returns the estimated value when cost data covers the stock", () => {
    const monitor = makeMonitor({
      totals: {
        batchesWithStock: 1,
        totalQuantity: 10,
        estimatedValueAtRisk: 123.5,
        quantityWithCost: 10,
        quantityWithoutCost: 0,
      },
    });
    expect(valueAtRisk(monitor)).toBe(123.5);
  });
});

describe("topNearExpiryRows", () => {
  it("preserves the server's most-urgent-first order and caps at 5", () => {
    const atRisk = Array.from({ length: 8 }, (_, i) =>
      makeRow({ batchId: `b${i}`, daysToExpiry: i + 1 }),
    );
    const rows = topNearExpiryRows(makeMonitor({ atRisk }));
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.batchId)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });

  it("skips rows without positive stock", () => {
    const rows = topNearExpiryRows(
      makeMonitor({ atRisk: [makeRow({ availableQuantity: 0 }), makeRow({ batchId: "b2" })] }),
    );
    expect(rows.map((r) => r.batchId)).toEqual(["b2"]);
  });

  it("is empty while the monitor has not loaded", () => {
    expect(topNearExpiryRows(undefined)).toEqual([]);
  });
});

describe("nearExpiryRowActions — never dispatch expired/quarantined/recalled", () => {
  it("offers dispatch + waste for active, non-expired stock", () => {
    const actions = nearExpiryRowActions(makeRow({ batchStatus: "ACTIVE", expiryStatus: "CRITICAL" }));
    expect(actions.map((a) => a.label)).toEqual(["Dispatch", "Record waste"]);
  });

  it("never offers dispatch for EXPIRED stock", () => {
    const actions = nearExpiryRowActions(makeRow({ expiryStatus: "EXPIRED" }));
    expect(actions.map((a) => a.label)).toEqual(["Record waste"]);
  });

  it("never offers dispatch for QUARANTINED stock", () => {
    const actions = nearExpiryRowActions(makeRow({ batchStatus: "QUARANTINED" }));
    expect(actions.map((a) => a.label)).toEqual(["Record waste"]);
  });

  it("never offers dispatch for RECALLED stock", () => {
    const actions = nearExpiryRowActions(makeRow({ batchStatus: "RECALLED" }));
    expect(actions.map((a) => a.label)).toEqual(["Record waste"]);
  });
});

describe("mergePendingCounts — deterministic ordering", () => {
  const draftOld = makeCount({ id: "d1", status: "PENDING", createdAt: "2026-11-01T00:00:00.000Z" });
  const draftNew = makeCount({ id: "d2", status: "PENDING", createdAt: "2026-11-03T00:00:00.000Z" });
  const submittedOld = makeCount({ id: "s1", status: "SUBMITTED", createdAt: "2026-11-02T00:00:00.000Z" });
  const submittedNew = makeCount({ id: "s2", status: "SUBMITTED", createdAt: "2026-11-04T00:00:00.000Z" });

  it("puts submitted rows first (awaiting review), oldest first within each group", () => {
    const merged = mergePendingCounts([draftNew, draftOld], [submittedNew, submittedOld]);
    expect(merged.map((c) => c.id)).toEqual(["s1", "s2", "d1", "d2"]);
  });

  it("does not mutate the input arrays", () => {
    const drafts = [draftNew, draftOld];
    const submitted = [submittedNew, submittedOld];
    mergePendingCounts(drafts, submitted);
    expect(drafts.map((c) => c.id)).toEqual(["d2", "d1"]);
    expect(submitted.map((c) => c.id)).toEqual(["s2", "s1"]);
  });

  it("handles not-yet-loaded lists", () => {
    expect(mergePendingCounts(undefined, [submittedOld])).toEqual([submittedOld]);
    expect(mergePendingCounts([draftOld], undefined)).toEqual([draftOld]);
    expect(mergePendingCounts(undefined, undefined)).toEqual([]);
  });

  it("caps at 5 rows", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      makeCount({ id: `s${i}`, status: "SUBMITTED", createdAt: `2026-11-0${i + 1}T00:00:00.000Z` }),
    );
    expect(mergePendingCounts([], many)).toHaveLength(5);
  });

  it("breaks createdAt ties by id", () => {
    const a = makeCount({ id: "aaa", status: "SUBMITTED", createdAt: "2026-11-02T00:00:00.000Z" });
    const b = makeCount({ id: "bbb", status: "SUBMITTED", createdAt: "2026-11-02T00:00:00.000Z" });
    expect(mergePendingCounts([], [b, a]).map((c) => c.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("quickActionsFor — role-filtered", () => {
  it("shows all six actions to ADMIN", () => {
    expect(quickActionsFor(users.admin).map((a) => a.key)).toEqual([
      "receipt", "dispatch", "waste", "count", "product", "import",
    ]);
  });

  it("shows all six actions to MANAGER", () => {
    expect(quickActionsFor(users.manager).map((a) => a.key)).toEqual([
      "receipt", "dispatch", "waste", "count", "product", "import",
    ]);
  });

  it("hides catalogue and import actions from OPERATOR", () => {
    expect(quickActionsFor(users.operator).map((a) => a.key)).toEqual([
      "receipt", "dispatch", "waste", "count",
    ]);
  });

  it("shows nothing while the user is unauthenticated/loading", () => {
    expect(quickActionsFor(null)).toEqual([]);
    expect(quickActionsFor(undefined)).toEqual([]);
  });
});

describe("warehouseSummaries", () => {
  it("maps the expiry monitor's per-warehouse breakdown", () => {
    const monitor = makeMonitor({
      warehouses: [
        {
          warehouseId: "w1",
          warehouseName: "Main Warehouse",
          warehouseCode: "WH-1",
          buckets: {
            SAFE: 50,
            MONITOR: 0,
            WARNING: 20,
            CRITICAL: 5,
            EXPIRED: 3,
          },
          totalQuantity: 78,
          estimatedValueAtRisk: 12,
        },
      ],
    });
    expect(warehouseSummaries(monitor)).toEqual([
      {
        warehouseId: "w1",
        name: "Main Warehouse",
        code: "WH-1",
        totalQuantity: 78,
        criticalQuantity: 5,
        warningQuantity: 20,
        expiredQuantity: 3,
      },
    ]);
  });

  it("is empty while the monitor has not loaded", () => {
    expect(warehouseSummaries(undefined)).toEqual([]);
  });
});
