"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Boxes, LogOut, Menu, X } from "lucide-react";
import { NavSections } from "./nav-sections";

/**
 * Mobile/tablet navigation (below md): a frosted top bar with the brand and
 * a hamburger that opens a slide-over drawer built on the shared Radix Dialog
 * primitives (focus trap + Escape come for free). It mirrors the desktop
 * sidebar exactly via the shared NavSections list.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes (covers back/forward too).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-white/10 bg-shell-sidebar/95 px-4 backdrop-blur-md md:hidden">
      <Link href="/dashboard" aria-label="ShelfSense home" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink">
          <Boxes className="h-5 w-5" aria-hidden />
        </span>
        <span className="font-heading text-base font-bold tracking-tight text-white">
          Shelf<span className="text-brand">Sense</span>
        </span>
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation menu"
            className="size-11 text-white/70 transition-colors hover:bg-white/10 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="top-0 bottom-0 left-0 flex h-svh max-h-svh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-r-2xl border-0 bg-shell-sidebar p-0 text-white/60 data-closed:slide-out-to-left data-closed:zoom-out-100 data-open:slide-in-from-left data-open:zoom-in-100"
        >
          <DialogTitle className="sr-only">Navigation menu</DialogTitle>
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink">
                <Boxes className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="font-heading text-base font-bold tracking-tight text-white">
                  Shelf<span className="text-brand">Sense</span>
                </p>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Inventory Expiry
                </p>
              </div>
            </div>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                className="size-10 text-white/70 transition-colors hover:bg-white/10 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </DialogClose>
          </div>

          <NavSections onNavigate={() => setOpen(false)} />

          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3 px-1 pb-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-brand text-xs font-bold text-brand-ink">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {user?.name}
                </span>
                <span className="block truncate text-[11px] text-white/40">{user?.email}</span>
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="min-h-11 w-full justify-start gap-3 rounded-lg px-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
