import { ModulePlaceholder } from "@/components/module-placeholder";
import { ClipboardList } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Reconciliation"
      milestone="Milestone 3"
      description="Batch code matching and discrepancy reports"
      icon={ClipboardList}
    />
  );
}
