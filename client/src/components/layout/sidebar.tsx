"use client";

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
import { Boxes, LogOut } from "lucide-react";
import { NavSections } from "./nav-sections";

/**
 * Desktop sidebar: near-black rail with a lime accent and a left indicator
 * on the active route. Navigation content is shared with the mobile drawer.
 */
export function Sidebar() {
  const { user, logout } = useAuth();

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden h-svh w-64 flex-col bg-shell-sidebar text-white/60 md:flex md:h-auto">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-ink">
          <Boxes className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-heading text-base font-bold tracking-tight text-white">
            Shelf<span className="text-brand">Sense</span>
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
            Inventory Expiry
          </p>
        </div>
      </div>

      <NavSections />

      <div className="border-t border-white/10 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-brand text-xs font-bold text-brand-ink">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
                <span className="block truncate text-[11px] uppercase tracking-wide text-white/40">
                  {user?.role}
                </span>
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
