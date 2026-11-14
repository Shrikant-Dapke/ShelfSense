import { can, type PermissionAction } from "@/features/auth/permissions";
import type { SessionUser } from "@/lib/types";
import {
  ArrowDownToLine,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileUp,
  LayoutDashboard,
  Package,
  ScanBarcode,
  Settings,
  Timer,
  Trash2,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
  /** When set, the item is only rendered for roles granted this permission. */
  permission?: PermissionAction;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Single source of truth for the authenticated app navigation, shared by the
 * desktop sidebar and the mobile drawer so both always show the same routes.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/products", label: "Products", icon: Package },
      { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon },
      { href: "/batches", label: "Batches", icon: ScanBarcode },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/receipts", label: "Receiving", icon: ArrowDownToLine },
      { href: "/reconciliation", label: "Reconciliation", icon: ClipboardList },
      { href: "/expiry", label: "Expiry", icon: Timer },
      { href: "/dispatch", label: "Dispatch", icon: Truck },
      { href: "/stock-counts", label: "Stock Counts", icon: ClipboardCheck },
      { href: "/waste", label: "Waste", icon: Trash2 },
      { href: "/imports", label: "Imports", icon: FileUp },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        soon: true,
        permission: "settings.admin",
      },
    ],
  },
];

/**
 * Filters NAV_SECTIONS down to what the signed-in user may see. Items without
 * a permission stay visible to every authenticated role; sections left with
 * no visible items are dropped so their heading never renders empty. Safe for
 * unauthenticated/loading users — permission-gated items are simply hidden.
 */
export function filterNavSections(
  sections: NavSection[],
  user: Pick<SessionUser, "role"> | null | undefined,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(user, item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
