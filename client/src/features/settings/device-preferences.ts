import type { Warehouse } from "@/lib/types";

/**
 * Device-local preferences, stored in `localStorage` only — never sent to the
 * backend. Every read is validated against a strict allowlist so a corrupted
 * or hand-edited value can never reach a request or break a page.
 */

const STORAGE_KEY = "shelfsense.preferences.v1";

export const RECEIPTS_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_RECEIPTS_PAGE_SIZE = 20;

export interface DevicePreferences {
  /** Warehouse id preselected in the receiving dialog. Null = ask every time. */
  defaultWarehouseId: string | null;
  /** Page size for the receipts list. Null = app default (20). */
  receiptsPageSize: number | null;
}

const EMPTY: DevicePreferences = {
  defaultWarehouseId: null,
  receiptsPageSize: null,
};

function readRaw(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    // Corrupted entry — behave as if nothing was stored.
    return {};
  }
}

function writeRaw(patch: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readRaw(), ...patch };
    // Never persist empties — keep the stored shape explicit.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — preferences are best-effort.
  }
}

/** Reads all preferences, validating each value; invalid entries read as null. */
export function loadDevicePreferences(): DevicePreferences {
  const raw = readRaw();
  return {
    defaultWarehouseId:
      typeof raw.defaultWarehouseId === "string" && raw.defaultWarehouseId.length > 0
        ? raw.defaultWarehouseId
        : null,
    receiptsPageSize:
      typeof raw.receiptsPageSize === "number" &&
      (RECEIPTS_PAGE_SIZE_OPTIONS as readonly number[]).includes(raw.receiptsPageSize)
        ? raw.receiptsPageSize
        : null,
  };
}

/**
 * Effective receipts page size: the stored preference when valid, otherwise
 * the app default (20) — matching the page's historical behavior.
 */
export function effectiveReceiptsPageSize(prefs: DevicePreferences): number {
  return prefs.receiptsPageSize ?? DEFAULT_RECEIPTS_PAGE_SIZE;
}

/**
 * Stores the default warehouse preference. Accepts `null` to clear it.
 * The id is stored as-is but only ever APPLIED after validation against the
 * loaded warehouses list (see `resolveDefaultWarehouseId`), so a stale id for
 * a warehouse that no longer exists (or the user cannot see) is ignored.
 */
export function saveDefaultWarehouseId(warehouseId: string | null): void {
  writeRaw({
    defaultWarehouseId: warehouseId && warehouseId.length > 0 ? warehouseId : null,
  });
}

export function saveReceiptsPageSize(pageSize: number | null): void {
  writeRaw({
    receiptsPageSize:
      pageSize !== null && (RECEIPTS_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
        ? pageSize
        : null,
  });
}

/**
 * Resolves which warehouse id should prefill the receiving dialog: the stored
 * preference only if it still refers to an active warehouse the user can see.
 */
export function resolveDefaultWarehouseId(
  prefs: DevicePreferences,
  warehouses: Pick<Warehouse, "id" | "isActive">[],
): string | null {
  const stored = prefs.defaultWarehouseId;
  if (!stored) return null;
  return warehouses.some((w) => w.id === stored && w.isActive) ? stored : null;
}
