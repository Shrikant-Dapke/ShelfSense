import { ModulePlaceholder } from "@/components/module-placeholder";
import { Timer } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Expiry Monitoring"
      milestone="Milestone 3"
      description="Near-expiry and expired stock monitoring"
      icon={Timer}
    />
  );
}
