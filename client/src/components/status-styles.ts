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

const EXPIRY_STYLE: StatusKindStyle = {
  classes: {
    SAFE: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    MONITOR: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    WARNING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    CRITICAL: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    EXPIRED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
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
    RECEIPT: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    DISPATCH: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    WASTE: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    TRANSFER_IN: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    TRANSFER_OUT: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    ADJUSTMENT: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
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
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    QUARANTINED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    RECALLED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  },
  labels: {
    ACTIVE: "Active",
    QUARANTINED: "Quarantined",
    RECALLED: "Recalled",
  },
};

const COUNT_STATUS_STYLE: StatusKindStyle = {
  classes: {
    PENDING: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    APPROVED: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    REJECTED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
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
    PENDING: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    VALIDATING: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    VALIDATED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    PROCESSING: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    PARTIALLY_COMPLETED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    COMMITTED: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
    FAILED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    ROLLED_BACK: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  },
  labels: {},
};

const WASTE_REASON_STYLE: StatusKindStyle = {
  classes: {
    EXPIRED: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    DAMAGED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    SPOILED: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    LOST: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    OTHER: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
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
    MULTI_WAREHOUSE: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    MULTI_ALIAS: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
    EXPIRED_STOCK: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    OPEN_VARIANCE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    INCONSISTENT: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
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
    ACTIVE: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
    INACTIVE: "bg-secondary text-secondary-foreground",
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
    className: kindStyle?.classes[value] ?? "border-border text-foreground",
    label: kindStyle?.labels[value] ?? value.replaceAll("_", " "),
  };
}
