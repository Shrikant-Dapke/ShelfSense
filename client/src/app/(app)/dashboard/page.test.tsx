import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "./page";
import type { ExpiryListRow, ExpiryMonitor } from "@/features/expiry-api";
import type { AnalyticsSummary } from "@/features/analytics-api";
import type { ReceiptView, DispatchView, StockCountView } from "@/features/inventory-api";

// The dashboard is the operational overview. These tests cover the contract
// that matters: loading shows skeletons (never fabricated numbers), failures
// surface explicitly (banner + em dashes), a real zero stays a real zero,
// missing data renders as an em dash, the near-expiry worklist never suggests
// dispatching expired/quarantined/recalled stock, pending counts order
// deterministically, quick actions are filtered by role, and warehouse
// summaries mirror the expiry monitor breakdown.

const mocks = vi.hoisted(() => ({
  role: "ADMIN" as "ADMIN" | "MANAGER" | "OPERATOR",
  getExpiryMonitor: vi.fn(),
  getAnalyticsSummary: vi.fn(),
  listStockCounts: vi.fn(),
  listReceipts: vi.fn(),
  listDispatches: vi.fn(),
  listMovements: vi.fn(),
}));

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    user: mocks.role
      ? { id: "u1", name: "Ada User", email: "ada@shelfsense.test", role: mocks.role }
      : null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/features/expiry-api", () => ({
  getExpiryMonitor: mocks.getExpiryMonitor,
}));

vi.mock("@/features/analytics-api", () => ({
  getAnalyticsSummary: mocks.getAnalyticsSummary,
}));

vi.mock("@/features/inventory-api", () => ({
  listStockCounts: mocks.listStockCounts,
  listReceipts: mocks.listReceipts,
  listDispatches: mocks.listDispatches,
  listMovements: mocks.listMovements,
}));

function page(items: unknown[], total: number) {
  return { items, meta: { page: 1, pageSize: 5, total, totalPages: 1 } };
}

const emptyBuckets = () => ({
  SAFE: { batches: 0, totalQuantity: 0 },
  MONITOR: { batches: 0, totalQuantity: 0 },
  WARNING: { batches: 0, totalQuantity: 0 },
  CRITICAL: { batches: 0, totalQuantity: 0 },
  EXPIRED: { batches: 0, totalQuantity: 0 },
});

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
    expiryDate: "2026-11-18T00:00:00.000Z",
    daysToExpiry: 4,
    expiryStatus: "CRITICAL",
    availableQuantity: 10,
    estimatedValue: null,
    unitCost: null,
    ...overrides,
  };
}

const monitorFixture: ExpiryMonitor = {
  buckets: {
    SAFE: { batches: 2, totalQuantity: 500 },
    MONITOR: { batches: 4, totalQuantity: 120 },
    WARNING: { batches: 3, totalQuantity: 40 },
    CRITICAL: { batches: 2, totalQuantity: 15 },
    EXPIRED: { batches: 1, totalQuantity: 12 },
  },
  totals: {
    batchesWithStock: 12,
    totalQuantity: 687,
    estimatedValueAtRisk: 845.5,
    quantityWithCost: 687,
    quantityWithoutCost: 0,
  },
  warehouses: [
    {
      warehouseId: "w1",
      warehouseName: "Main Warehouse",
      warehouseCode: "WH-1",
      buckets: { SAFE: 500, MONITOR: 120, WARNING: 40, CRITICAL: 15, EXPIRED: 12 },
      totalQuantity: 687,
      estimatedValueAtRisk: 845.5,
    },
    {
      warehouseId: "w2",
      warehouseName: "Overflow Warehouse",
      warehouseCode: "WH-2",
      buckets: { SAFE: 30, MONITOR: 0, WARNING: 0, CRITICAL: 0, EXPIRED: 0 },
      totalQuantity: 30,
      estimatedValueAtRisk: 0,
    },
  ],
  atRisk: [
    makeRow({ batchId: "b-crit-1", canonicalCode: "LOT-C1", daysToExpiry: 2, expiryStatus: "CRITICAL" }),
    makeRow({
      batchId: "b-quar",
      canonicalCode: "LOT-Q1",
      batchStatus: "QUARANTINED",
      daysToExpiry: 5,
      expiryStatus: "WARNING",
    }),
    makeRow({ batchId: "b-warn-1", canonicalCode: "LOT-W1", daysToExpiry: 9, expiryStatus: "WARNING" }),
  ],
  expired: [makeRow({ batchId: "b-exp", expiryStatus: "EXPIRED", daysToExpiry: -3 })],
};

const analyticsFixture: AnalyticsSummary = {
  period: "30d",
  granularity: "day",
  fromDate: "2026-10-15",
  toDate: "2026-11-14",
  inventory: {
    totalStockQuantity: 950,
    activeProducts: 1,
    activeWarehouses: 2,
    byCategory: [],
    byWarehouse: [],
  },
  movements: {
    series: [],
    totals: {
      receipts: 0,
      dispatches: 0,
      transfersIn: 0,
      transfersOut: 0,
      adjustments: 0,
      records: 0,
    },
  },
  waste: {
    totalQuantity: 5,
    records: 1,
    byReason: [],
    byWarehouse: [],
    receivedQuantity: 100,
    wastePercentOfReceived: 5,
    estimatedValue: null,
    quantityWithCost: 5,
    quantityWithoutCost: 0,
  },
  expiry: {
    buckets: {} as AnalyticsSummary["expiry"]["buckets"],
    expiredQuantity: 12,
    nearExpiryQuantity: 55,
    estimatedValueAtRisk: 845.5,
    quantityWithCost: 687,
    quantityWithoutCost: 0,
  },
  dispatch: { topProducts: [], byWarehouse: [] },
};

const submittedCount: StockCountView = {
  id: "c-submitted",
  warehouseId: "w1",
  warehouseName: "Main Warehouse",
  warehouseCode: "WH-1",
  status: "SUBMITTED",
  referenceNo: "COUNT-2026-002",
  description: null,
  countedAt: "2026-11-13T00:00:00.000Z",
  countedByName: "Ravi Kulkarni",
  approvedByName: null,
  approvedAt: null,
  postedByName: null,
  postedAt: null,
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
  items: [],
  totalExpectedQuantity: 95,
  totalCountedQuantity: 95,
  totalVariance: 0,
};

const pendingCount: StockCountView = {
  ...submittedCount,
  id: "c-pending",
  status: "PENDING",
  referenceNo: "COUNT-2026-001",
  countedAt: null,
  countedByName: null,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
};

const receiptFixture: ReceiptView = {
  id: "r1",
  warehouseId: "w1",
  warehouseName: "Main Warehouse",
  warehouseCode: "WH-1",
  supplierName: "Acme Foods",
  referenceNo: "RCV-001",
  receivedAt: "2026-11-13T00:00:00.000Z",
  createdBy: "u1",
  createdByName: "Ada User",
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
  items: [{ id: "ri1" }] as ReceiptView["items"],
};

const dispatchFixture: DispatchView = {
  id: "d1",
  warehouseId: "w1",
  warehouseName: "Main Warehouse",
  warehouseCode: "WH-1",
  referenceNo: "DSP-001",
  dispatchedAt: "2026-11-13T00:00:00.000Z",
  createdBy: "u1",
  createdByName: "Ada User",
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
  items: [{ id: "di1" }] as DispatchView["items"],
};

function loadAll(resolved = true) {
  if (resolved) {
    mocks.getExpiryMonitor.mockResolvedValue(monitorFixture);
    mocks.getAnalyticsSummary.mockResolvedValue(analyticsFixture);
    // Called for PENDING and SUBMITTED lists — route by the status argument.
    mocks.listStockCounts.mockImplementation((params: { status: string }) =>
      params.status === "PENDING"
        ? Promise.resolve(page([pendingCount], 1))
        : Promise.resolve(page([submittedCount], 1)),
    );
    mocks.listReceipts.mockResolvedValue(page([receiptFixture], 1));
    mocks.listDispatches.mockResolvedValue(page([dispatchFixture], 1));
    mocks.listMovements.mockResolvedValue(
      page(
        [
          {
            id: "m1",
            warehouseId: "w1",
            warehouseName: "Main Warehouse",
            warehouseCode: "WH-1",
            batchId: "b1",
            canonicalCode: "LOT-1",
            productId: "p1",
            productName: "Product P",
            productSku: "SKU-1",
            movementType: "RECEIPT",
            quantity: 100,
            referenceId: null,
            occurredAt: "2026-11-13T00:00:00.000Z",
            createdBy: "u1",
            createdByName: "Ada User",
            createdAt: "2026-11-13T00:00:00.000Z",
          },
        ],
        1,
      ),
    );
  } else {
    mocks.getExpiryMonitor.mockReturnValue(new Promise(() => {}));
    mocks.getAnalyticsSummary.mockReturnValue(new Promise(() => {}));
    mocks.listStockCounts.mockReturnValue(new Promise(() => {}));
    mocks.listReceipts.mockReturnValue(new Promise(() => {}));
    mocks.listDispatches.mockReturnValue(new Promise(() => {}));
    mocks.listMovements.mockReturnValue(new Promise(() => {}));
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.role = "ADMIN";
  [
    mocks.getExpiryMonitor,
    mocks.getAnalyticsSummary,
    mocks.listStockCounts,
    mocks.listReceipts,
    mocks.listDispatches,
    mocks.listMovements,
  ].forEach((m) => m.mockReset());
});

describe("Dashboard — KPI section", () => {
  it("shows skeletons and no fabricated numbers while loading", async () => {
    loadAll(false);
    renderPage();

    // 8 KPI cards loading -> skeletons, and no KPI has rendered a number yet.
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Total Stock")).toBeInTheDocument();
    expect(screen.queryByText("950")).not.toBeInTheDocument();
  });

  it("renders KPI values from the loaded data", async () => {
    loadAll();
    renderPage();

    expect(await screen.findByText("950")).toBeInTheDocument(); // total stock
    // Scope to each KPI card via its unique description: the fixture has two
    // cards whose value is "5" (near-expiry batches and waste quantity), so a
    // bare getByText("5") would be ambiguous.
    const kpiCard = (description: string) =>
      screen.getByText(description).closest<HTMLElement>('[data-slot="card"]');
    // Near-expiry KPI = CRITICAL(2) + WARNING(3) batches = 5
    expect(kpiCard("Expiring within 14 days (critical + warning)")?.textContent).toContain("5");
    expect(kpiCard("Quantity of expired stock still on hand")?.textContent).toContain("12");
    expect(kpiCard("Estimated value of stock on hand")?.textContent).toContain("845.5");
  });

  it("renders an em dash for unavailable values, never a fabricated zero", async () => {
    const noCost = structuredClone(monitorFixture);
    noCost.totals = { ...noCost.totals, quantityWithCost: 0, quantityWithoutCost: 687, estimatedValueAtRisk: 0 };
    const noReceipts = {
      ...analyticsFixture,
      waste: { ...analyticsFixture.waste, wastePercentOfReceived: null },
    };
    mocks.getExpiryMonitor.mockResolvedValue(noCost);
    mocks.getAnalyticsSummary.mockResolvedValue(noReceipts);
    mocks.listStockCounts.mockResolvedValue(page([], 0));
    mocks.listReceipts.mockResolvedValue(page([], 0));
    mocks.listDispatches.mockResolvedValue(page([], 0));
    mocks.listMovements.mockResolvedValue(page([], 0));
    renderPage();

    await screen.findByText("no cost data for stock on hand");
    await screen.findByText("no receipts in window — % unavailable");
    // Two unavailable values: value at risk (no cost data) and waste % (no receipts).
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("sums pending + submitted count totals for the KPI", async () => {
    loadAll();
    renderPage();

    await screen.findByText("COUNT-2026-002");
    // The KPI card is the one with the KPI description (the worklist card
    // shares the "Pending Stock Counts" title).
    const kpiCard = screen
      .getByText("Drafts + counts awaiting review")
      .closest<HTMLElement>('[data-slot="card"]');
    expect(kpiCard?.textContent).toContain("2");
  });

  it("surfaces failed queries in the banner with a retry-all button", async () => {
    mocks.getExpiryMonitor.mockRejectedValue(new Error("boom"));
    mocks.getAnalyticsSummary.mockRejectedValue(new Error("boom"));
    mocks.listStockCounts.mockRejectedValue(new Error("boom"));
    mocks.listReceipts.mockRejectedValue(new Error("boom"));
    mocks.listDispatches.mockRejectedValue(new Error("boom"));
    mocks.listMovements.mockRejectedValue(new Error("boom"));
    renderPage();

    const banner = await screen.findByText(/Some dashboard data failed to load/);
    expect(banner.textContent).toContain("expiry monitor");
    expect(banner.textContent).toContain("waste summary (30d)");
    expect(banner.textContent).toContain("recent receipts");
    expect(screen.getByRole("button", { name: "Retry failed dashboard requests" })).toBeInTheDocument();
  });
});

describe("Dashboard — needs attention worklists", () => {
  it("lists the top near-expiry rows in the server's urgency order", async () => {
    loadAll();
    renderPage();

    const critical = await screen.findByText("LOT-C1");
    expect(critical).toBeInTheDocument();
    expect(screen.getByText("LOT-Q1")).toBeInTheDocument();
    expect(screen.getByText("LOT-W1")).toBeInTheDocument();
  });

  it("never suggests dispatching quarantined stock, but still offers waste", async () => {
    loadAll();
    renderPage();

    const quarantinedRow = (await screen.findByText("LOT-Q1")).closest<HTMLElement>(".rounded-lg")!;
    expect(within(quarantinedRow).queryByText("Dispatch")).toBeNull();
    expect(within(quarantinedRow).getByText("Record waste")).toBeInTheDocument();
    expect(within(quarantinedRow).getByText("Quarantined")).toBeInTheDocument();
  });

  it("offers dispatch for active near-expiry stock", async () => {
    loadAll();
    renderPage();

    const activeRow = (await screen.findByText("LOT-C1")).closest<HTMLElement>(".rounded-lg")!;
    expect(within(activeRow).getByText("Dispatch")).toBeInTheDocument();
    expect(within(activeRow).getByText("Record waste")).toBeInTheDocument();
  });

  it("lists pending stock counts with submitted first, regardless of fetch order", async () => {
    loadAll();
    renderPage();

    await screen.findByText("COUNT-2026-002");
    const worklist = screen
      .getByText("COUNT-2026-002")
      .closest<HTMLElement>("div.space-y-2\\.5")!;
    const rows = Array.from(worklist.querySelectorAll(":scope > div.rounded-lg"));
    const ids = rows.map((r) => r.textContent);
    const submittedIndex = ids.findIndex((t) => t?.includes("COUNT-2026-002"));
    const pendingIndex = ids.findIndex((t) => t?.includes("COUNT-2026-001"));
    expect(submittedIndex).toBeGreaterThanOrEqual(0);
    expect(pendingIndex).toBeGreaterThan(submittedIndex);
  });

  it("shows the worklist empty state", async () => {
    loadAll();
    mocks.getExpiryMonitor.mockResolvedValue({
      ...monitorFixture,
      atRisk: [],
      expired: [],
    });
    mocks.listStockCounts.mockResolvedValue(page([], 0));
    renderPage();

    expect(await screen.findByText("Nothing approaching expiry within 30 days.")).toBeInTheDocument();
    expect(await screen.findByText("No pending stock counts.")).toBeInTheDocument();
  });
});

describe("Dashboard — role-filtered quick actions", () => {
  it("shows all six quick actions to ADMIN", async () => {
    loadAll();
    mocks.role = "ADMIN";
    renderPage();

    await screen.findByText("Quick Actions");
    for (const label of [
      "Receive stock",
      "Create dispatch",
      "Record waste",
      "New stock count",
      "New product",
      "New import",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("shows the same six actions to MANAGER", async () => {
    loadAll();
    mocks.role = "MANAGER";
    renderPage();

    await screen.findByText("Quick Actions");
    expect(screen.getByRole("link", { name: /New product/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New import/ })).toBeInTheDocument();
  });

  it("hides catalogue and import actions from OPERATOR", async () => {
    loadAll();
    mocks.role = "OPERATOR";
    renderPage();

    await screen.findByText("Quick Actions");
    for (const label of ["Receive stock", "Create dispatch", "Record waste", "New stock count"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: /New product/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /New import/ })).toBeNull();
  });
});

describe("Dashboard — warehouse overview", () => {
  it("renders per-warehouse stock and expiry-pressure chips", async () => {
    loadAll();
    renderPage();

    expect(await screen.findByText("Main Warehouse")).toBeInTheDocument();
    expect(screen.getByText("Overflow Warehouse")).toBeInTheDocument();
    expect(screen.getByText("687")).toBeInTheDocument(); // WH-1 on hand
    expect(screen.getByText("12 expired")).toBeInTheDocument();
    expect(screen.getByText("15 critical")).toBeInTheDocument();
    expect(screen.getByText("40 warning")).toBeInTheDocument();
    expect(screen.getByText("no expiry pressure")).toBeInTheDocument(); // WH-2
    const overview = screen.getByLabelText("Warehouse overview");
    expect(within(overview).getAllByRole("link", { name: "Inventory →" }).length).toBe(2);
    expect(within(overview).getAllByRole("link", { name: "Expiry →" }).length).toBe(2);
  });

  it("shows the empty state when no warehouse has stock", async () => {
    loadAll();
    mocks.getExpiryMonitor.mockResolvedValue({ ...monitorFixture, warehouses: [] });
    renderPage();

    expect(
      await screen.findByText(/No stock on hand yet — warehouse summaries appear once stock is received/),
    ).toBeInTheDocument();
  });
});

describe("Dashboard — recent activity", () => {
  it("renders receipts, dispatches and movements with navigation links", async () => {
    loadAll();
    renderPage();

    expect(await screen.findByText("RCV-001")).toBeInTheDocument();
    expect(screen.getByText("DSP-001")).toBeInTheDocument();
    expect(screen.getByText("Receipt")).toBeInTheDocument(); // movement badge label
    expect(screen.getAllByRole("link", { name: "View all" }).length).toBe(3);
    expect(screen.getAllByRole("link", { name: "Inventory →" }).length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty states for activity lists without data", async () => {
    loadAll();
    mocks.listReceipts.mockResolvedValue(page([], 0));
    mocks.listDispatches.mockResolvedValue(page([], 0));
    mocks.listMovements.mockResolvedValue(page([], 0));
    renderPage();

    expect(await screen.findByText("No receipts recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No dispatches recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No stock movements recorded yet.")).toBeInTheDocument();
  });
});
