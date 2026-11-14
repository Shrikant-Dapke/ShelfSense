import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";
import { ApiClientError } from "@/lib/api-client";

// The login page is the app's auth entry point. These tests cover the
// critical workflow: backend error messages surface verbatim, unknown
// failures fall back to a generic message, success hands control to
// the router for redirect, and `?next=` targets are honored only when
// they point at a safe internal path.

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  user: null as { id: string; name: string; email: string; role: "ADMIN" } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

const loginMock = vi.fn();

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    isLoading: false,
    login: loginMock,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  loginMock.mockReset();
  mocks.replace.mockReset();
  mocks.searchParams = new URLSearchParams();
  mocks.user = null;
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("Login page (critical auth workflow)", () => {
  it("surfaces the backend error message verbatim on invalid credentials", async () => {
    loginMock.mockRejectedValue(
      new ApiClientError(401, { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password" }),
    );

    render(<LoginPage />);
    await fillAndSubmit("admin@shelfsense.local", "wrong-password");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows the generic fallback for non-API failures", async () => {
    loginMock.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<LoginPage />);
    await fillAndSubmit("admin@shelfsense.local", "whatever");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to sign in. Please try again.");
  });

  it("redirects to the dashboard after a successful login", async () => {
    loginMock.mockResolvedValue({ id: "u1", role: "ADMIN" });

    render(<LoginPage />);
    await fillAndSubmit("admin@shelfsense.local", "Admin123!");

    // The error alert must not be present, and the router takes over.
    await vi.waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("redirects to a safe internal ?next path after a successful login", async () => {
    mocks.searchParams = new URLSearchParams("?next=/products");
    loginMock.mockResolvedValue({ id: "u1", role: "ADMIN" });

    render(<LoginPage />);
    await fillAndSubmit("admin@shelfsense.local", "Admin123!");

    await vi.waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/products");
    });
  });

  it.each([
    ["protocol-relative URL", "//evil.com"],
    ["absolute external URL", "https://evil.com/phish"],
    ["encoded protocol-relative URL", "%2F%2Fevil.com"],
    ["backslash variant", "\\\\evil.com"],
    ["non-path value", "evil.com/x"],
  ])("falls back to the dashboard for unsafe ?next= (%s)", async (_label, next) => {
    mocks.searchParams = new URLSearchParams(`?next=${next}`);
    loginMock.mockResolvedValue({ id: "u1", role: "ADMIN" });

    render(<LoginPage />);
    await fillAndSubmit("admin@shelfsense.local", "Admin123!");

    await vi.waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    });
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringContaining("evil"));
  });

  it("redirects already-signed-in visitors immediately, honoring a safe ?next", async () => {
    mocks.user = { id: "u1", name: "Ada Admin", email: "admin@shelfsense.local", role: "ADMIN" };
    mocks.searchParams = new URLSearchParams("?next=/products");

    render(<LoginPage />);

    await vi.waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/products");
    });
  });
});
