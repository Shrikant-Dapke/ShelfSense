import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";
import { statusStyle, EXPIRY_BAR, STATUS_STYLES } from "./status-styles";

describe("StatusBadge", () => {
  it("applies the centralized classes and label for a known status", () => {
    render(<StatusBadge kind="expiry" value="EXPIRED" />);

    const badge = screen.getByText("Expired");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-rose-50");
    expect(badge.getAttribute("data-variant")).toBe("outline");
  });

  it("falls back to the raw value for unknown statuses", () => {
    render(<StatusBadge kind="importStatus" value="FUTURE_STATUS" />);

    expect(screen.getByText("FUTURE STATUS")).toBeInTheDocument();
  });

  it("allows a label override", () => {
    render(<StatusBadge kind="movement" value="TRANSFER_IN" label="Stock in" />);
    expect(screen.getByText("Stock in")).toBeInTheDocument();
  });
});

describe("statusStyle", () => {
  it("uses Title-case labels for movement types", () => {
    expect(statusStyle("movement", "TRANSFER_OUT").label).toBe("Transfer out");
    expect(statusStyle("movement", "RECEIPT").className).toContain("bg-emerald-50");
  });

  it("maps count statuses to workflow labels", () => {
    expect(statusStyle("countStatus", "PENDING").label).toBe("Draft");
    expect(statusStyle("countStatus", "SUBMITTED").className).toContain("bg-amber-50");
  });

  it("maps waste reasons and reconciliation conditions", () => {
    expect(statusStyle("wasteReason", "SPOILED").label).toBe("Spoiled");
    expect(statusStyle("reconCondition", "MULTI_ALIAS").label).toBe("Multiple aliases");
  });

  it("maps active/inactive product and warehouse states", () => {
    expect(statusStyle("active", "ACTIVE").className).toContain("bg-teal-50");
    expect(statusStyle("active", "INACTIVE").label).toBe("Inactive");
  });

  it("exports accent bar colors per expiry bucket", () => {
    expect(EXPIRY_BAR.WARNING).toBe("bg-amber-500");
    expect(EXPIRY_BAR.EXPIRED).toBe("bg-rose-500");
  });

  it("covers every expiry and batch status", () => {
    for (const value of ["SAFE", "MONITOR", "WARNING", "CRITICAL", "EXPIRED"]) {
      expect(STATUS_STYLES.expiry.classes[value]).toBeTruthy();
    }
    for (const value of ["ACTIVE", "QUARANTINED", "RECALLED"]) {
      expect(STATUS_STYLES.batchStatus.classes[value]).toBeTruthy();
    }
  });
});
