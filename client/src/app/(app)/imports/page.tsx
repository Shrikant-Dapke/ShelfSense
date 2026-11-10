import { ModulePlaceholder } from "@/components/module-placeholder";
import { FileUp } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Imports"
      milestone="Milestone 2"
      description="CSV/Excel inventory imports"
      icon={FileUp}
    />
  );
}
