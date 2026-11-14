import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./filter-bar";
import { Select } from "@/components/ui/select";

describe("FilterBar", () => {
  it("renders a labeled search input wired to onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar
        search={{ value: "", onChange, label: "Search products", placeholder: "Search…" }}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search products" });
    await user.type(input, "milk");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders children (filter controls) and an optional Reset button", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <FilterBar
        search={{ value: "", onChange: vi.fn(), label: "Search" }}
        onReset={onReset}
      >
        <div data-testid="custom-filter">category select</div>
      </FilterBar>,
    );

    expect(screen.getByTestId("custom-filter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("omits the search box and Reset button when not configured", () => {
    render(
      <FilterBar>
        <div data-testid="custom-filter">filters</div>
      </FilterBar>,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();
  });

  it("disables Reset while a request is pending", () => {
    render(<FilterBar onReset={vi.fn()} resetDisabled>
      <Select />
    </FilterBar>);
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeDisabled();
  });
});
