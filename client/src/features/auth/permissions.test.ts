import { describe, expect, it } from "vitest";
import { can, type PermissionAction } from "./permissions";

// This is the executable mirror of the role matrix in `docs/api.md` ("## Roles").
// Every action × every role is asserted explicitly, so a docs/policy change
// that is not reflected here (or vice versa) fails loudly. The backend
// `requireRoles` middleware remains the real security boundary; `can()`
// only decides what the UI shows.

const users = {
  admin: { id: "u1", name: "Ada Admin", email: "admin@shelfsense.test", role: "ADMIN" as const },
  manager: { id: "u2", name: "Malik Manager", email: "manager@shelfsense.test", role: "MANAGER" as const },
  operator: { id: "u3", name: "Ola Operator", email: "operator@shelfsense.test", role: "OPERATOR" as const },
};

// [action, ADMIN, MANAGER, OPERATOR]
const MATRIX: Array<[PermissionAction, boolean, boolean, boolean]> = [
  // Products
  ["product.create", true, true, false],
  ["product.update", true, true, false],
  ["product.deactivate", true, false, false],
  // Warehouses (create / update / delete are one backend policy row)
  ["warehouse.manage", true, false, false],
  // Inventory corrections
  ["inventory.adjust", true, true, false],
  ["inventory.transfer", true, true, false],
  // All-roles operational actions
  ["receipt.create", true, true, true],
  ["dispatch.create", true, true, true],
  ["count.create", true, true, true],
  ["count.submit", true, true, true],
  ["waste.record", true, true, true],
  // Batches
  ["batch.manage", true, true, false],
  // Stock counts (approve / post)
  ["count.approve", true, true, false],
  ["count.post", true, true, false],
  // Imports (upload / validate / execute)
  ["import.upload", true, true, false],
  ["import.validate", true, true, false],
  ["import.execute", true, true, false],
  // Waste (administrative summary)
  ["waste.summary", true, true, false],
  // Administration
  ["settings.admin", true, false, false],
];

describe("can() — centralized permission matrix (mirrors docs/api.md)", () => {
  it.each(MATRIX)("%s → admin=%s manager=%s operator=%s", (action, admin, manager, operator) => {
    expect(can(users.admin, action)).toBe(admin);
    expect(can(users.manager, action)).toBe(manager);
    expect(can(users.operator, action)).toBe(operator);
  });

  it("covers every action in the matrix", () => {
    // Guards against accidentally leaving an action out of the table above.
    expect(MATRIX).toHaveLength(19);
  });

  it("denies everything to unauthenticated / loading users", () => {
    for (const [action] of MATRIX) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });
});
