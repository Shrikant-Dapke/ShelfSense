import { ModulePlaceholder } from "@/components/module-placeholder";
import { Settings } from "lucide-react";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Settings"
      milestone="Milestone 4"
      description="Expiry thresholds, profile and audit logs"
      icon={Settings}
    />
  );
}
