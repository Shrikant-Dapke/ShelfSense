"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Authenticated shell: dark navy sidebar + light workspace.
 * The proxy guards page access coarsely; this layer also handles the case of
 * a stale/invalid cookie (present but the API rejects it).
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
      <div className="flex min-h-svh flex-col md:flex-row">
        <div className="flex h-14 items-center gap-3 border-b border-white/10 bg-[#0d1f33] px-4 md:hidden">
          <Skeleton className="h-9 w-9 rounded-lg bg-white/10" />
          <Skeleton className="h-4 w-28 bg-white/10" />
        </div>
        <div className="hidden w-64 flex-col gap-4 bg-[#0d1f33] p-5 md:flex">
          <Skeleton className="h-9 w-9 rounded-lg bg-white/10" />
          <Skeleton className="h-4 w-32 bg-white/10" />
          <Skeleton className="h-4 w-24 bg-white/10" />
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-8 lg:px-10">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-4 h-40 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <MobileNav />
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-8 lg:px-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
