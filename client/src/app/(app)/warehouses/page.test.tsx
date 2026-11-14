import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehousesPage from "./page";
import type { Warehouse } from "@/lib/types";

// Critical page actions: warehouse create/deactivate are ADMIN-only per the
// backend policy (POST/PATCH/DELETE /warehouses). The page must hide those
// actions for MANAGER/OPERATOR while keeping the read-only table usable —
// the backend remains the authoritative boundary.

const mocks = vi.hoisted(() => ({
  role: "ADMIN" as "ADMIN" | "MANAGER" | "OPERATOR",
  listWarehouses: vi.fn(),
}));

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Ada User", email: "ada@shelfsense.test", role: mocks.role },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/features/inventory-api", () => ({
  listWarehouses: mocks.listWarehouses,
  createWarehouse: vi.fn(),
  deactivateWarehouse: vi.fn(),
}));

const warehouse: Warehouse = {
  id: "w1",
  name: "Main Warehouse",
  code: "WH1",
  location: "Addis Ababa",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WarehousesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.role = "ADMIN";
  mocks.listWarehouses.mockReset().mockResolvedValue({
    items: [warehouse],
    meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
  });
});

describe("Warehouses page — role-based actions", () => {
  it("shows the create and deactivate actions to ADMIN", async () => {
    renderPage();

    expect(await screen.findByRole("button", { name: /New Warehouse/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Deactivate Main Warehouse" }),
    ).toBeInTheDocument();
  });

  it("hides create/deactivate from MANAGER but keeps the read-only table", async () => {
    mocks.role = "MANAGER";
    renderPage();

    expect(await screen.findByText("Main Warehouse")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Warehouse/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Deactivate Main Warehouse" }),
    ).toBeNull();
  });

  it("hides create/deactivate from OPERATOR but keeps the read-only table", async () => {
    mocks.role = "OPERATOR";
    renderPage();

    expect(await screen.findByText("Main Warehouse")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Warehouse/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Deactivate Main Warehouse" }),
    ).toBeNull();
  });
});
