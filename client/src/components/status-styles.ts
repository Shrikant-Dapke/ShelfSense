/**
 * Centralized status styling for the whole app. Every page renders status
 * badges through `StatusBadge`, which looks its styling up here — the same
 * status always looks the same, on every page.
 */

export type ExpiryStatusName = "SAFE" | "MONITOR" | "WARNING" | "CRITICAL" | "EXPIRED";
export type MovementTypeName =
  | "RECEIPT"
  | "DISPATCH"
  | "WASTE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "ADJUSTMENT";
export type BatchStatusName = "ACTIVE" | "QUARANTINED" | "RECALLED";
export type CountStatusName = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type WasteReasonName = "EXPIRED" | "DAMAGED" | "SPOILED" | "LOST" | "OTHER";
export type ReconciliationConditionName =
  | "MULTI_WAREHOUSE"
  | "MULTI_ALIAS"
  | "EXPIRED_STOCK"
  | "OPEN_VARIANCE"
  | "INCONSISTENT";
export type ActiveStatusName = "ACTIVE" | "INACTIVE";

export interface StatusKindStyle {
  classes: Record<string, string>;
  labels: Record<string, string>;
}

/**
 * Semantic status tones backed by Stage B tokens. Lime is reserved for
 * primary actions and selected states; statuses use danger/warning/success/
 * info and a neutral tone, each with a soft fill, matching hairline and a
 * text color tuned for contrast in both themes.
 */
const TONES = {
  neutral:
    "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]",
  danger:
    "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]",
  warning:
    "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]",
  success:
    "bg-[var(--status-success-soft)] text-[var(--status-success-ink)] border-[var(--status-success-border)]",
  info: "bg-[var(--status-info-soft)] text-[var(--status-info-ink)] border-[var(--status-info-border)]",
} as const;

const EXPIRY_STYLE: StatusKindStyle = {
  classes: {
    SAFE: TONES.success,
    MONITOR: TONES.info,
    WARNING: TONES.warning,
    CRITICAL: TONES.warning,
    EXPIRED: TONES.danger,
  },
  labels: {
    SAFE: "Safe",
    MONITOR: "Monitor",
    WARNING: "Warning",
    CRITICAL: "Critical",
    EXPIRED: "Expired",
  },
};

const MOVEMENT_STYLE: StatusKindStyle = {
  classes: {
    RECEIPT: TONES.success,
    DISPATCH: TONES.danger,
    WASTE: TONES.neutral,
    TRANSFER_IN: TONES.info,
    TRANSFER_OUT: TONES.warning,
    ADJUSTMENT: TONES.info,
  },
  labels: {
    RECEIPT: "Receipt",
    DISPATCH: "Dispatch",
    WASTE: "Waste",
    TRANSFER_IN: "Transfer in",
    TRANSFER_OUT: "Transfer out",
    ADJUSTMENT: "Adjustment",
  },
};

const BATCH_STATUS_STYLE: StatusKindStyle = {
  classes: {
    ACTIVE: TONES.success,
    QUARANTINED: TONES.warning,
    RECALLED: TONES.danger,
  },
  labels: {
    ACTIVE: "Active",
    QUARANTINED: "Quarantined",
    RECALLED: "Recalled",
  },
};

const COUNT_STATUS_STYLE: StatusKindStyle = {
  classes: {
    PENDING: TONES.neutral,
    SUBMITTED: TONES.warning,
    APPROVED: TONES.info,
    REJECTED: TONES.danger,
  },
  labels: {
    PENDING: "Draft",
    SUBMITTED: "Submitted",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  },
};

const IMPORT_STATUS_STYLE: StatusKindStyle = {
  classes: {
    PENDING: TONES.neutral,
    VALIDATING: TONES.info,
    VALIDATED: TONES.success,
    PROCESSING: TONES.info,
    COMPLETED: TONES.success,
    PARTIALLY_COMPLETED: TONES.warning,
    COMMITTED: TONES.success,
    FAILED: TONES.danger,
    ROLLED_BACK: TONES.danger,
  },
  labels: {},
};

const WASTE_REASON_STYLE: StatusKindStyle = {
  classes: {
    EXPIRED: TONES.danger,
    DAMAGED: TONES.warning,
    SPOILED: TONES.warning,
    LOST: TONES.neutral,
    OTHER: TONES.info,
  },
  labels: {
    EXPIRED: "Expired",
    DAMAGED: "Damaged",
    SPOILED: "Spoiled",
    LOST: "Lost",
    OTHER: "Other",
  },
};

const RECON_CONDITION_STYLE: StatusKindStyle = {
  classes: {
    MULTI_WAREHOUSE: TONES.info,
    MULTI_ALIAS: TONES.info,
    EXPIRED_STOCK: TONES.danger,
    OPEN_VARIANCE: TONES.warning,
    INCONSISTENT: TONES.danger,
  },
  labels: {
    MULTI_WAREHOUSE: "Multi-warehouse",
    MULTI_ALIAS: "Multiple aliases",
    EXPIRED_STOCK: "Expired stock",
    OPEN_VARIANCE: "Open variance",
    INCONSISTENT: "Inconsistent",
  },
};

const ACTIVE_STATUS_STYLE: StatusKindStyle = {
  classes: {
    ACTIVE: TONES.success,
    INACTIVE: TONES.neutral,
  },
  labels: {
    ACTIVE: "Active",
    INACTIVE: "Inactive",
  },
};

export const STATUS_STYLES: Record<string, StatusKindStyle> = {
  expiry: EXPIRY_STYLE,
  movement: MOVEMENT_STYLE,
  batchStatus: BATCH_STATUS_STYLE,
  countStatus: COUNT_STATUS_STYLE,
  importStatus: IMPORT_STATUS_STYLE,
  wasteReason: WASTE_REASON_STYLE,
  reconCondition: RECON_CONDITION_STYLE,
  active: ACTIVE_STATUS_STYLE,
};

/** Shared accent-bar colors used by the expiry buckets chart/list rows. */
export const EXPIRY_BAR: Record<ExpiryStatusName, string> = {
  SAFE: "bg-emerald-500",
  MONITOR: "bg-sky-500",
  WARNING: "bg-amber-500",
  CRITICAL: "bg-orange-500",
  EXPIRED: "bg-rose-500",
};

export interface StatusStyleResult {
  className: string;
  label: string;
}

/**
 * Look up badge classes + display label for a status. Unknown values fall
 * back to a neutral outline badge showing the raw value, so new server-side
 * statuses can never crash a page.
 */
export function statusStyle(kind: string, value: string): StatusStyleResult {
  const kindStyle = STATUS_STYLES[kind];
  return {
    className: kindStyle?.classes[value] ?? "border-hairline text-ink",
    label: kindStyle?.labels[value] ?? value.replaceAll("_", " "),
  };
}
