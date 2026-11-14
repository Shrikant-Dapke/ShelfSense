import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TableState,
  TableSkeletonRows,
  TableErrorRow,
  TableEmptyRow,
} from "./table-state";
import { Table, TableBody } from "@/components/ui/table";

function renderInTable(ui: React.ReactNode) {
  return render(
    <Table>
      <TableBody>{ui}</TableBody>
    </Table>,
  );
}

describe("TableState", () => {
  it("renders skeleton rows while loading", () => {
    renderInTable(<TableState isLoading colSpan={4} skeletonRows={3} />);

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    // Every row is a full-width skeleton: 4 cells each with a skeleton inside.
    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBe(12);
  });

  it("renders the error message and calls onRetry from the Retry button", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderInTable(
      <TableState
        error={new Error("Network request failed")}
        onRetry={onRetry}
        colSpan={2}
      />,
    );

    expect(screen.getByText("Failed to load data")).toBeInTheDocument();
    expect(screen.getByText("Network request failed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the branded empty state", () => {
    renderInTable(
      <TableState
        empty={{ icon: undefined, title: "No products found", hint: "Try another search." }}
        colSpan={3}
      />,
    );

    expect(screen.getByText("No products found")).toBeInTheDocument();
    expect(screen.getByText("Try another search.")).toBeInTheDocument();
  });

  it("renders nothing when data is present (no loading/error/empty)", () => {
    renderInTable(<TableState colSpan={3} />);
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });

  it("exports TableErrorRow with a custom title", () => {
    renderInTable(<TableErrorRow title="Failed to load movements" colSpan={2} />);
    expect(screen.getByText("Failed to load movements")).toBeInTheDocument();
  });

  it("exports TableSkeletonRows with the requested shape", () => {
    renderInTable(<TableSkeletonRows rows={2} cols={3} />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBe(6);
  });

  it("exports TableEmptyRow with a default icon", () => {
    renderInTable(<TableEmptyRow title="Nothing here" colSpan={1} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
