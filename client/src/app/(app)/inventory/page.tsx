import { ModulePlaceholder } from "@/components/module-placeholder";
import { Boxes } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Inventory"
      milestone="Milestone 2"
      description="Stock balances, movements and physical counts"
      icon={Boxes}
    />
  );
}
