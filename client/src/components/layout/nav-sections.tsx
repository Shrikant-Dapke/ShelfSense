"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, filterNavSections } from "./nav-config";

/** Shared Premium Industrial nav primitives for the sidebar and mobile drawer. */
export const navGroupLabelClass =
  "px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40";

export const navLinkClass =
  "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function navLinkStateClass(active: boolean): string {
  return active
    ? "bg-white/[0.08] font-semibold text-white"
    : "text-white/60 hover:bg-white/[0.06] hover:text-white";
}

export const navActiveMarkerClass =
  "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-brand shadow-[0_0_10px_rgba(189,255,66,0.45)]";

/**
 * Single source of truth for the navigation list. The desktop sidebar and
 * mobile drawer render the exact same links, active state and permissions;
 * the drawer additionally closes itself on navigation.
 */
export function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {filterNavSections(NAV_SECTIONS, user).map((section) => (
        <div key={section.label}>
          <p className={navGroupLabelClass}>{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(navLinkClass, navLinkStateClass(active), item.soon && "opacity-55")}
                  >
                    <span className={cn(navActiveMarkerClass, active ? "opacity-100" : "opacity-0")} />
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active ? "text-brand" : "text-white/50 group-hover:text-brand",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.soon ? (
                      <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
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
  );
}
