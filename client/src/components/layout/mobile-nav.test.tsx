import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "./mobile-nav";

// The mobile nav is the small-viewport application navigation. These tests
// cover the drawer workflow: top-bar render, open/close (hamburger, Escape,
// route change), active-route highlighting carried over from the sidebar,
// and sign-out.

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  logout: vi.fn(),
  role: "OPERATOR" as "ADMIN" | "MANAGER" | "OPERATOR",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Ada User",
      email: "ada@shelfsense.test",
      role: mocks.role,
    },
    isLoading: false,
    login: vi.fn(),
    logout: mocks.logout,
  }),
}));

function renderNav() {
  const view = render(<MobileNav />);
  return { ...view, rerender: () => view.rerender(<MobileNav />) };
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  mocks.pathname = "/dashboard";
  mocks.role = "OPERATOR";
  mocks.logout.mockClear();
});

describe("MobileNav", () => {
  it("renders the mobile top bar with ShelfSense branding and no open drawer", () => {
    renderNav();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ShelfSense home" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open navigation menu" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the drawer with navigation sections and the signed-in user", async () => {
    const user = userEvent.setup();
    renderNav();

    const drawer = await openDrawer(user);

    expect(drawer).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Dispatch" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Ada User")).toBeInTheDocument();
    expect(screen.getByText("ada@shelfsense.test")).toBeInTheDocument();
  });

  it("hides the Administration section from OPERATOR users", async () => {
    const user = userEvent.setup();
    renderNav();

    await openDrawer(user);

    // Shared sections stay; the ADMIN-only Settings item (and its empty
    // section heading) is filtered out.
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
    expect(screen.queryByText("Administration")).toBeNull();
  });

  it("shows the Administration section to ADMIN users", async () => {
    mocks.role = "ADMIN";
    const user = userEvent.setup();
    renderNav();

    await openDrawer(user);

    expect(screen.getAllByRole("link", { name: /Settings/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("Administration")).toBeInTheDocument();
  });

  it("closes the drawer on Escape", async () => {
    const user = userEvent.setup();
    renderNav();

    await openDrawer(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the drawer via the close button", async () => {
    const user = userEvent.setup();
    renderNav();

    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Close navigation menu" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the drawer when the route changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderNav();

    await openDrawer(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    mocks.pathname = "/inventory";
    rerender();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("highlights the active route while the drawer is open", async () => {
    const user = userEvent.setup();
    mocks.pathname = "/inventory";
    renderNav();

    await openDrawer(user);

    const activeLink = screen.getAllByRole("link", { name: "Inventory" })[0];
    expect(activeLink).toHaveAttribute("aria-current", "page");
    const inactiveLink = screen.getAllByRole("link", { name: "Dispatch" })[0];
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("signs out from the drawer", async () => {
    const user = userEvent.setup();
    renderNav();

    await openDrawer(user);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
