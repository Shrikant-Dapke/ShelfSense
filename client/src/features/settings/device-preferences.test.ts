import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDevicePreferences,
  saveDefaultWarehouseId,
  saveReceiptsPageSize,
  effectiveReceiptsPageSize,
  resolveDefaultWarehouseId,
  RECEIPTS_PAGE_SIZE_OPTIONS,
} from "./device-preferences";

const STORAGE_KEY = "shelfsense.preferences.v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("device-preferences", () => {
  it("reads empty storage as all-null preferences", () => {
    expect(loadDevicePreferences()).toEqual({
      defaultWarehouseId: null,
      receiptsPageSize: null,
    });
    expect(effectiveReceiptsPageSize(loadDevicePreferences())).toBe(20);
  });

  it("persists and reloads a valid default warehouse id", () => {
    saveDefaultWarehouseId("wh-123");
    expect(loadDevicePreferences().defaultWarehouseId).toBe("wh-123");

    saveDefaultWarehouseId(null);
    expect(loadDevicePreferences().defaultWarehouseId).toBeNull();
  });

  it("persists and reloads a valid page size from the allowlist", () => {
    for (const size of RECEIPTS_PAGE_SIZE_OPTIONS) {
      saveReceiptsPageSize(size);
      expect(loadDevicePreferences().receiptsPageSize).toBe(size);
    }
    expect(effectiveReceiptsPageSize(loadDevicePreferences())).toBe(
      RECEIPTS_PAGE_SIZE_OPTIONS[RECEIPTS_PAGE_SIZE_OPTIONS.length - 1],
    );
  });

  it("reads hand-corrupted storage as null instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadDevicePreferences()).toEqual({
      defaultWarehouseId: null,
      receiptsPageSize: null,
    });

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2]));
    expect(loadDevicePreferences().receiptsPageSize).toBeNull();
  });

  it("ignores invalid stored values (off-allowlist page size, non-string warehouse id)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultWarehouseId: 42, receiptsPageSize: 999 }),
    );
    const prefs = loadDevicePreferences();
    expect(prefs.defaultWarehouseId).toBeNull();
    expect(prefs.receiptsPageSize).toBeNull();
    expect(effectiveReceiptsPageSize(prefs)).toBe(20);
  });

  it("saveReceiptsPageSize stores off-allowlist values as null", () => {
    saveReceiptsPageSize(37 as never);
    expect(loadDevicePreferences().receiptsPageSize).toBeNull();
  });

  describe("resolveDefaultWarehouseId", () => {
    const warehouses = [
      { id: "wh-1", isActive: true },
      { id: "wh-2", isActive: false },
    ];

    it("returns the stored id only when it matches an active warehouse", () => {
      saveDefaultWarehouseId("wh-1");
      expect(resolveDefaultWarehouseId(loadDevicePreferences(), warehouses)).toBe("wh-1");
    });

    it("ignores a stored id for an inactive or unknown warehouse", () => {
      saveDefaultWarehouseId("wh-2");
      expect(resolveDefaultWarehouseId(loadDevicePreferences(), warehouses)).toBeNull();

      saveDefaultWarehouseId("wh-gone");
      expect(resolveDefaultWarehouseId(loadDevicePreferences(), warehouses)).toBeNull();
    });

    it("returns null when no preference is stored", () => {
      expect(resolveDefaultWarehouseId(loadDevicePreferences(), warehouses)).toBeNull();
    });
  });
});
