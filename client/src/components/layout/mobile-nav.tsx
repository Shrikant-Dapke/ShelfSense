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
import { NAV_SECTIONS, filterNavSections } from "./nav-config";
import { Boxes, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile/tablet navigation (below the md breakpoint): a sticky top bar with
 * ShelfSense branding and a hamburger that opens a slide-over drawer built on
 * the shared Radix Dialog primitives (focus trap + Escape come for free).
 * Mirrors the desktop sidebar's sections, active-route highlighting and
 * sign-out. The desktop sidebar is untouched above md.
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
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-white/10 bg-[#0d1f33] px-4 md:hidden">
        <Link
          href="/dashboard"
          aria-label="ShelfSense home"
          className="flex items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
            <Boxes className="h-5 w-5 text-teal-300" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            ShelfSense
          </span>
        </Link>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
              className="size-11 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="top-0 bottom-0 left-0 flex h-svh max-h-svh w-72 translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-r-xl bg-[#0d1f33] p-0 text-slate-300 data-closed:slide-out-to-left data-closed:zoom-out-100 data-open:slide-in-from-left data-open:zoom-in-100"
          >
            <DialogTitle className="sr-only">Navigation menu</DialogTitle>
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15">
                  <Boxes className="h-5 w-5 text-teal-300" aria-hidden />
                </span>
                <div>
                  <p className="text-base font-semibold tracking-tight text-white">
                    ShelfSense
                  </p>
                  <p className="text-[11px] leading-tight text-slate-400">
                    Inventory Expiry Platform
                  </p>
                </div>
              </div>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close navigation menu"
                  className="size-10 text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden />
                </Button>
              </DialogClose>
            </div>

            <nav
              className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
              aria-label="Main navigation"
            >
              {filterNavSections(NAV_SECTIONS, user).map((section) => (
                <div key={section.label}>
                  <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    {section.label}
                  </p>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                              active
                                ? "bg-white/10 font-medium text-white"
                                : "hover:bg-white/5 hover:text-white",
                              item.soon && "opacity-55",
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
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
              <div className="flex items-center gap-2.5 px-1 pb-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-teal-500/20 text-xs font-medium text-teal-200">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {user?.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {user?.email}
                  </span>
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="min-h-11 w-full justify-start gap-2.5 px-2 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>
    </>
  );
}
