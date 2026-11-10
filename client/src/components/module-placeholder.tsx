import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ModulePlaceholder({
  title,
  milestone,
  description,
  icon: Icon,
}: {
  title: string;
  milestone: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0d1f33]">
          <Icon className="h-5 w-5 text-teal-300" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </header>
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Construction className="h-4 w-4 text-amber-500" aria-hidden />
            Planned for {milestone}
          </CardTitle>
          <CardDescription>
            This module is part of the ShelfSense roadmap and will be activated in an upcoming
            milestone. The foundation (authentication, products and warehouses) is live now.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          See the delivery plan in <code className="rounded bg-slate-100 px-1.5 py-0.5">docs/</code>{" "}
          for the milestone schedule.
        </CardContent>
      </Card>
    </div>
  );
}
