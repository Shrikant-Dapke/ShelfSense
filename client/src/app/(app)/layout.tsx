"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Authenticated shell. Desktop uses an inset, rounded Premium Industrial
 * workspace (near-black sidebar + off-white canvas); mobile stays full-bleed
 * with the existing drawer navigation. The proxy guards page access coarsely;
 * this layer also handles a stale/invalid cookie (present but API rejects it).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-svh bg-frame p-0 md:p-[1.5vw]">
        <div className="flex min-h-svh w-full max-w-[1800px] flex-col bg-canvas text-ink shadow-shell md:min-h-[calc(100svh-3vw)] md:overflow-hidden md:flex-row md:rounded-shell md:ring-1 md:ring-black/5 dark:md:ring-white/5">
          <div className="flex h-14 items-center gap-3 border-b border-white/10 bg-shell-sidebar px-4 md:hidden">
            <Skeleton className="h-9 w-9 rounded-lg bg-white/10" />
            <Skeleton className="h-4 w-28 bg-white/10" />
          </div>
          <div className="hidden w-64 flex-col gap-4 bg-shell-sidebar p-5 md:flex">
            <Skeleton className="h-9 w-9 rounded-lg bg-white/10" />
            <Skeleton className="h-4 w-32 bg-white/10" />
            <Skeleton className="h-4 w-24 bg-white/10" />
          </div>
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-4 h-40 w-full" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-frame p-0 md:p-[1.5vw]">
      <div className="mx-auto flex min-h-svh w-full max-w-[1800px] flex-col bg-canvas text-ink shadow-shell md:min-h-[calc(100svh-3vw)] md:flex-row md:overflow-hidden md:rounded-shell md:ring-1 md:ring-black/5 dark:md:ring-white/5">
        <MobileNav />
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
