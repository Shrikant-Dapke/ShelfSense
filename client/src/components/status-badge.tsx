import { Badge } from "@/components/ui/badge";
import { statusStyle } from "./status-styles";
import { cn } from "@/lib/utils";

/**
 * Status badge with centralized styling. Pages never hand-roll badge class
 * maps; they render `<StatusBadge kind="expiry" value={item.expiryStatus} />`
 * and the look is defined once in status-styles.ts.
 */
export function StatusBadge({
  kind,
  value,
  className,
  label,
}: {
  kind: string;
  value: string;
  className?: string;
  /** Override the default display label when a page needs different copy. */
  label?: string;
}) {
  const style = statusStyle(kind, value);
  return (
    <Badge variant="outline" className={cn(style.className, className)}>
      {label ?? style.label}
    </Badge>
  );
}
