import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";
import { ApiClientError } from "@/lib/api-client";

// The login page is the app's auth entry point. These tests cover the
// critical workflow: backend error messages surface verbatim, unknown
// failures fall back to a generic message, and success hands control to
// the router for redirect.

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const loginMock = vi.fn();

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: loginMock,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  loginMock.mockReset();
  replaceMock.mockReset();
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
    expect(replaceMock).not.toHaveBeenCalled();
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
      expect(replaceMock).toHaveBeenCalledWith("/dashboard");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
