import type { SessionUser, UserRole } from "@/lib/types";

/**
 * Every UI permission that gates a mutation or administrative surface.
 * Action names mirror the backend endpoints they represent, and the mapping
 * below is the frontend mirror of the authoritative role matrix in
 * `docs/api.md` ("## Roles").
 *
 * The backend `requireRoles` middleware remains the actual security boundary:
 * `can()` only decides what the interface shows. Never treat a passing
 * frontend check as authorization, and never hide a whole page when only
 * some of its actions are restricted.
 */
export type PermissionAction =
  // Products
  | "product.create"
  | "product.update"
  | "product.deactivate"
  // Warehouses (create / update / delete share one backend policy row)
  | "warehouse.manage"
  // Inventory corrections
  | "inventory.adjust"
  | "inventory.transfer"
  // Receiving / dispatching (all roles)
  | "receipt.create"
  | "dispatch.create"
  // Canonical batches (create / update / aliases)
  | "batch.manage"
  // Stock counts
  | "count.create"
  | "count.submit"
  | "count.approve"
  | "count.post"
  // Imports
  | "import.upload"
  | "import.validate"
  | "import.execute"
  // Waste
  | "waste.record"
  | "waste.summary"
  // Administration
  | "settings.admin";

/**
 * Explicit action → roles mapping, mirroring `docs/api.md` § Roles.
 * Roles are listed per action instead of being derived from a hierarchy so
 * that a future policy change which breaks the ADMIN ⊃ MANAGER ⊃ OPERATOR
 * ordering is still expressed (and caught by tests) correctly.
 */
const ROLE_PERMISSIONS: Record<PermissionAction, readonly UserRole[]> = {
  "product.create": ["ADMIN", "MANAGER"],
  "product.update": ["ADMIN", "MANAGER"],
  "product.deactivate": ["ADMIN"],
  "warehouse.manage": ["ADMIN"],
  "inventory.adjust": ["ADMIN", "MANAGER"],
  "inventory.transfer": ["ADMIN", "MANAGER"],
  "receipt.create": ["ADMIN", "MANAGER", "OPERATOR"],
  "dispatch.create": ["ADMIN", "MANAGER", "OPERATOR"],
  "batch.manage": ["ADMIN", "MANAGER"],
  "count.create": ["ADMIN", "MANAGER", "OPERATOR"],
  "count.submit": ["ADMIN", "MANAGER", "OPERATOR"],
  "count.approve": ["ADMIN", "MANAGER"],
  "count.post": ["ADMIN", "MANAGER"],
  "import.upload": ["ADMIN", "MANAGER"],
  "import.validate": ["ADMIN", "MANAGER"],
  "import.execute": ["ADMIN", "MANAGER"],
  "waste.record": ["ADMIN", "MANAGER", "OPERATOR"],
  "waste.summary": ["ADMIN", "MANAGER"],
  "settings.admin": ["ADMIN"],
};

/**
 * Returns whether `user` may perform `action`. Safe for unauthenticated or
 * still-loading users (`user` null/undefined): they can do nothing.
 */
export function can(
  user: Pick<SessionUser, "role"> | null | undefined,
  action: PermissionAction,
): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[action].includes(user.role);
}
