import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsPage from "./page";

// Settings page behavior: every role gets Profile/Security/Preferences/
// Appearance, the audit-log tab is ADMIN-only, profile updates flow through
// useAuth (which keeps the cached session user in sync), password change is
// validated client-side against the shared policy, and device preferences
// persist to localStorage. The backend remains the authoritative boundary.

const mocks = vi.hoisted(() => ({
  role: "OPERATOR" as "ADMIN" | "MANAGER" | "OPERATOR",
  user: {
    id: "u1",
    name: "Test Operator",
    email: "operator@shelfsense.test",
    role: "OPERATOR" as "ADMIN" | "MANAGER" | "OPERATOR",
  },
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  listWarehouses: vi.fn(),
  listAuditLogs: vi.fn(),
  setTheme: vi.fn(),
  theme: "light",
}));

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    user: mocks.user ? { ...mocks.user, role: mocks.role } : null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: mocks.updateProfile,
    changePassword: mocks.changePassword,
  }),
}));

vi.mock("@/features/inventory-api", () => ({
  listWarehouses: mocks.listWarehouses,
}));

vi.mock("@/features/settings/audit-api", () => ({
  listAuditLogs: mocks.listAuditLogs,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mocks.theme, setTheme: mocks.setTheme }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.role = "OPERATOR";
  mocks.user = {
    id: "u1",
    name: "Test Operator",
    email: "operator@shelfsense.test",
    role: "OPERATOR",
  };
  mocks.theme = "light";
  mocks.listWarehouses.mockResolvedValue({
    items: [
      { id: "wh-1", name: "Main Warehouse", code: "WH1", isActive: true },
    ],
    meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  });
  mocks.listAuditLogs.mockResolvedValue({
    data: [],
    meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  });
});

describe("Settings page — section visibility", () => {
  it("shows the four base sections and hides the audit tab for OPERATOR", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Security/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preferences/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Appearance/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Audit log/i })).toBeNull();
  });

  it("hides the audit tab for MANAGER", () => {
    mocks.role = "MANAGER";
    renderPage();
    expect(screen.queryByRole("button", { name: /Audit log/i })).toBeNull();
  });

  it("shows the audit tab for ADMIN", () => {
    mocks.role = "ADMIN";
    renderPage();
    expect(screen.getByRole("button", { name: /Audit log/i })).toBeInTheDocument();
  });
});

describe("Settings page — profile", () => {
  it("updates the display name through useAuth (trimmed)", async () => {
    const user = userEvent.setup();
    mocks.updateProfile.mockResolvedValue({ ...mocks.user, name: "Renamed Operator" });
    renderPage();

    const nameInput = await screen.findByLabelText("Display name");
    expect(nameInput).toHaveValue("Test Operator");
    await user.clear(nameInput);
    await user.type(nameInput, "  Renamed Operator  ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updateProfile).toHaveBeenCalledWith({ name: "Renamed Operator" });
  });

  it("blocks an empty name and caps the input at 100 characters", async () => {
    const user = userEvent.setup();
    renderPage();

    const nameInput = await screen.findByLabelText("Display name");
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Name is required")).toBeInTheDocument();

    // The input enforces the schema's max length natively, so the 422 path
    // stays a server-side safety net only.
    await user.type(nameInput, "x".repeat(101));
    expect(nameInput).toHaveValue("x".repeat(100));
    expect(screen.queryByText("Name must be at most 100 characters")).toBeNull();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});

describe("Settings page — security", () => {
  async function openSecurityAndFill(
    user: ReturnType<typeof userEvent.setup>,
    fields: { current: string; next: string; confirm: string },
  ) {
    await user.click(screen.getByRole("button", { name: /Security/i }));
    await user.type(await screen.findByLabelText("Current password"), fields.current);
    await user.type(screen.getByLabelText("New password", { selector: "#password-new" }), fields.next);
    await user.type(
      screen.getByLabelText("Confirm new password"),
      fields.confirm,
    );
  }

  it("blocks weak passwords with the shared policy and never calls the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await openSecurityAndFill(user, { current: "OldPass1!", next: "short1", confirm: "short1" });

    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeDisabled();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("blocks mismatched confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await openSecurityAndFill(user, {
      current: "OldPass1!",
      next: "NewPass123",
      confirm: "NewPass124",
    });

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("submits a valid change", async () => {
    const user = userEvent.setup();
    mocks.changePassword.mockResolvedValue(mocks.user);
    renderPage();
    await openSecurityAndFill(user, {
      current: "OldPass1!",
      next: "NewPass123",
      confirm: "NewPass123",
    });

    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(mocks.changePassword).toHaveBeenCalledWith({
      currentPassword: "OldPass1!",
      newPassword: "NewPass123",
    });
  });
});

describe("Settings page — preferences", () => {
  it("persists the page-size choice to localStorage", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Preferences/i }));

    // Open the page-size select and pick 25.
    await user.click(await screen.findByRole("combobox", { name: "Receipts list rows per page" }));
    await user.click(await screen.findByRole("option", { name: "25 rows" }));

    const stored = JSON.parse(window.localStorage.getItem("shelfsense.preferences.v1") ?? "{}");
    expect(stored.receiptsPageSize).toBe(25);
  });

  it("persists the default warehouse choice to localStorage", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Preferences/i }));

    await user.click(await screen.findByRole("combobox", { name: "Default warehouse for receiving" }));
    await user.click(await screen.findByRole("option", { name: /Main Warehouse/ }));

    const stored = JSON.parse(window.localStorage.getItem("shelfsense.preferences.v1") ?? "{}");
    expect(stored.defaultWarehouseId).toBe("wh-1");
  });
});

describe("Settings page — appearance", () => {
  it("switches the theme through next-themes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Appearance/i }));

    const dark = await screen.findByRole("radio", { name: "Dark" });
    await user.click(dark);
    expect(mocks.setTheme).toHaveBeenCalledWith("dark");

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(mocks.setTheme).toHaveBeenCalledWith("system");
  });
});
