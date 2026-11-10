import { ModulePlaceholder } from "@/components/module-placeholder";
import { Truck } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Dispatch"
      milestone="Milestone 3"
      description="FEFO dispatch recommendations"
      icon={Truck}
    />
  );
}
