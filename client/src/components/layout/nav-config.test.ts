import { describe, expect, it } from "vitest";
import { NAV_SECTIONS, filterNavSections } from "./nav-config";

// Navigation visibility is driven by the centralized permission helper. Since
// M4-E every nav item — including Settings — is visible to every role: the
// Settings page gates its internal sections (the audit log is ADMIN-only)
// instead of hiding the whole route. Sections whose items are all filtered
// out would disappear entirely so their heading never renders empty.

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
  it.each(["admin", "manager", "operator"] as const)(
    "shows every section including Settings to %s",
    (role) => {
      const labels = visibleLabels(users[role]);
      expect(labels).toContain("Settings");
      expect(labels).toContain("Dashboard");
      expect(labels).toContain("Inventory");
    },
  );

  it("keeps the Administration section for non-admin roles", () => {
    const sections = filterNavSections(NAV_SECTIONS, users.operator);
    expect(sections.find((s) => s.label === "Administration")).toBeDefined();
  });

  it("shows Settings while the user is loading / signed out (page itself gates content)", () => {
    const labels = visibleLabels(null);
    expect(labels).toContain("Settings");
    expect(labels).toContain("Dashboard");
  });

  it("does not mutate NAV_SECTIONS", () => {
    const before = JSON.stringify(NAV_SECTIONS);
    filterNavSections(NAV_SECTIONS, users.operator);
    expect(JSON.stringify(NAV_SECTIONS)).toBe(before);
  });
});
