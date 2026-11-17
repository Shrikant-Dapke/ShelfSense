import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceSection } from "./appearance-section";

const mockSetTheme = vi.fn();
let currentTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: currentTheme,
    setTheme: mockSetTheme,
  }),
}));

describe("AppearanceSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTheme = "light";
  });

  it("renders light, dark, and system theme options", () => {
    render(<AppearanceSection />);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Light/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Dark/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /System/i })).toBeInTheDocument();
  });

  it("marks the active theme based on useTheme hook", () => {
    currentTheme = "dark";
    render(<AppearanceSection />);
    expect(screen.getByRole("radio", { name: /Dark/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Light/i })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /System/i })).toHaveAttribute("aria-checked", "false");
  });

  it("calls setTheme when user selects a different theme", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);

    await user.click(screen.getByRole("radio", { name: /Dark/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");

    await user.click(screen.getByRole("radio", { name: /System/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");

    await user.click(screen.getByRole("radio", { name: /Light/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});
