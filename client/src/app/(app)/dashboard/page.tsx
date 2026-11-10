"use client";

import { useAuth } from "@/features/auth/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Boxes, Package, Warehouse as WarehouseIcon } from "lucide-react";

export default function DashboardPage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {isLoading ? "Welcome" : `Welcome back, ${user?.name?.split(" ")[0]}`}
        </h1>
        <p className="text-sm text-slate-500">
          Smarter Inventory. Less Waste. Better Distribution.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "Total Stock", desc: "Across all warehouses", icon: Boxes },
          { title: "Near-Expiry Stock", desc: "At-risk batches", icon: Package },
          { title: "Warehouses", desc: "Active locations", icon: WarehouseIcon },
        ].map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <kpi.icon className="h-3.5 w-3.5" aria-hidden />
                {kpi.title}
              </CardDescription>
              <CardTitle className="text-3xl text-slate-900">
                {isLoading ? <Skeleton className="h-8 w-16" /> : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-400">
                {kpi.desc} · live KPIs arrive with the analytics milestone
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900">Milestone 1 — Foundation</CardTitle>
          <CardDescription>
            Authentication, role-based access, product and warehouse management are live against
            the real API. Inventory, reconciliation, expiry and FEFO engines follow in
            Milestones 2–3, dashboard KPIs in Milestone 4.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          You are signed in as <strong>{user?.email}</strong> with the{" "}
          <strong>{user?.role}</strong> role.
        </CardContent>
      </Card>
    </div>
  );
}
