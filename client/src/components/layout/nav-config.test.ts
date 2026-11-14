import { describe, expect, it } from "vitest";
import { NAV_SECTIONS, filterNavSections } from "./nav-config";

// Navigation visibility is driven by the centralized permission helper. The
// Settings item is ADMIN-only; every other item is visible to all
// authenticated roles. Sections whose items are all filtered out must
// disappear entirely so their heading never renders empty.

const users = {
  admin: { id: "u1", name: "Ada Admin", email: "admin@shelfsense.test", role: "ADMIN" as const },
  manager: { id: "u2", name: "Malik Manager", email: "manager@shelfsense.test", role: "MANAGER" as const },
  operator: { id: "u3", name: "Ola Operator", email: "operator@shelfsense.test", role: "OPERATOR" as const },
};

function visibleLabels(user: (typeof users)[keyof typeof users] | null): string[] {
  return filterNavSections(NAV_SECTIONS, user).flatMap((section) =>
    section.items.map((item) => item.label),
  );
}

describe("filterNavSections", () => {
  it("shows every section to ADMIN, including Administration", () => {
    const labels = visibleLabels(users.admin);
    expect(labels).toContain("Settings");
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Inventory");
  });

  it("shows shared sections to MANAGER but hides Administration", () => {
    const labels = visibleLabels(users.manager);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Inventory");
    expect(labels).not.toContain("Settings");
  });

  it("shows shared sections to OPERATOR but hides Administration", () => {
    const labels = visibleLabels(users.operator);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Inventory");
    expect(labels).not.toContain("Settings");
  });

  it("drops the whole Administration section heading for non-admin roles", () => {
    const sections = filterNavSections(NAV_SECTIONS, users.operator);
    expect(sections.find((s) => s.label === "Administration")).toBeUndefined();
  });

  it("hides permission-gated items while the user is loading / signed out", () => {
    const labels = visibleLabels(null);
    expect(labels).not.toContain("Settings");
    expect(labels).toContain("Dashboard");
  });

  it("does not mutate NAV_SECTIONS", () => {
    const before = JSON.stringify(NAV_SECTIONS);
    filterNavSections(NAV_SECTIONS, users.operator);
    expect(JSON.stringify(NAV_SECTIONS)).toBe(before);
  });
});
