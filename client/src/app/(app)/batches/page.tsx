import { ModulePlaceholder } from "@/components/module-placeholder";
import { ScanBarcode } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Batches"
      milestone="Milestone 2"
      description="Canonical batches and warehouse aliases"
      icon={ScanBarcode}
    />
  );
}
