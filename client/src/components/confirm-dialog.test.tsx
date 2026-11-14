import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const props: Parameters<typeof ConfirmDialog>[0] = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Record waste?",
    description: "This permanently deducts 5 kg from the ledger. This cannot be undone.",
    confirmLabel: "Record waste",
    onConfirm: vi.fn(),
    ...overrides,
  };
  return render(<ConfirmDialog {...props} />);
}

describe("ConfirmDialog", () => {
  it("renders the title, consequence copy and action buttons", () => {
    renderDialog();

    expect(screen.getByText("Record waste?")).toBeInTheDocument();
    expect(
      screen.getByText(/permanently deducts 5 kg from the ledger/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record waste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    await user.click(screen.getByRole("button", { name: "Record waste" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenChange(false) when cancelled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables actions and shows a spinner while pending", () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole("button", { name: "Record waste" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(document.querySelector("[data-slot='button'] svg.animate-spin")).not.toBeNull();
  });

  it("does not render when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Record waste?")).not.toBeInTheDocument();
  });
});
