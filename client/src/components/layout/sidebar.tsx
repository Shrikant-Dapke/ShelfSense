"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownToLine,
  Boxes,
  ClipboardList,
  FileUp,
  LayoutDashboard,
  LogOut,
  Package,
  ScanBarcode,
  Timer,
  Trash2,
  Truck,
  Users,
  Warehouse as WarehouseIcon,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_SECTIONS: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; soon?: boolean }>;
}> = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/analytics", label: "Analytics", icon: BarChart3, soon: true },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Inventory", icon: Boxes, soon: true },
      { href: "/products", label: "Products", icon: Package },
      { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon },
      { href: "/batches", label: "Batches", icon: ScanBarcode, soon: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/receipts", label: "Receiving", icon: ArrowDownToLine },
      { href: "/reconciliation", label: "Reconciliation", icon: ClipboardList, soon: true },
      { href: "/expiry", label: "Expiry", icon: Timer, soon: true },
      { href: "/dispatch", label: "Dispatch", icon: Truck, soon: true },
      { href: "/waste", label: "Waste", icon: Trash2, soon: true },
      { href: "/imports", label: "Imports", icon: FileUp, soon: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, soon: true },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex h-svh w-64 flex-col bg-[#0d1f33] text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
          <Boxes className="h-5 w-5 text-teal-300" aria-hidden />
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight text-white">ShelfSense</p>
          <p className="text-[11px] leading-tight text-slate-400">Inventory Expiry Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-white/10 font-medium text-white"
                          : "hover:bg-white/5 hover:text-white",
                        item.soon && "opacity-55",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.soon ? (
                        <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                          soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2.5 px-2 text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-teal-500/20 text-xs font-medium text-teal-200">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-white">{user?.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{user?.role}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate text-sm">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
