"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWarehouses } from "@/features/inventory-api";
import {
  loadDevicePreferences,
  resolveDefaultWarehouseId,
  saveDefaultWarehouseId,
  saveReceiptsPageSize,
  effectiveReceiptsPageSize,
  RECEIPTS_PAGE_SIZE_OPTIONS,
} from "./device-preferences";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * "Preferences" settings section: device-local defaults (localStorage only —
 * never synced to the backend). Changes apply immediately on this device.
 */
export function PreferencesSection() {
  const [prefs, setPrefs] = useState(() => loadDevicePreferences());

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses", "all"],
    queryFn: () => listWarehouses({ pageSize: 100, isActive: "true" }),
  });
  const warehouses = warehousesData?.items ?? [];

  // Re-validate the stored default against the loaded warehouse list: a
  // warehouse deleted since it was saved (or invisible to this user) is
  // ignored rather than preselected.
  const resolvedDefault = resolveDefaultWarehouseId(prefs, warehouses);

  // Keep local state in sync with storage (e.g. another tab changed it).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "shelfsense.preferences.v1") setPrefs(loadDevicePreferences());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const activeWarehouses = warehouses.filter((w) => w.isActive);

  return (
    <div className="space-y-6 sm:max-w-md">
      <div className="space-y-2">
        <Label htmlFor="pref-default-warehouse">Default warehouse for receiving</Label>
        <Select
          value={resolvedDefault ?? "none"}
          onValueChange={(v) => {
            saveDefaultWarehouseId(v === "none" ? null : v);
            setPrefs(loadDevicePreferences());
            toast.success("Preference saved on this device");
          }}
        >
          <SelectTrigger id="pref-default-warehouse">
            <SelectValue placeholder="Choose a warehouse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ask every time</SelectItem>
            {activeWarehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} ({w.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-muted">
          Preselects this warehouse in the receiving dialog. Stored only in this browser.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pref-page-size">Receipts list rows per page</Label>
        <Select
          value={String(effectiveReceiptsPageSize(prefs))}
          onValueChange={(v) => {
            saveReceiptsPageSize(Number(v));
            setPrefs(loadDevicePreferences());
            toast.success("Preference saved on this device");
          }}
        >
          <SelectTrigger id="pref-page-size" className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RECEIPTS_PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-muted">
          Applies to the receiving list on this device.
        </p>
      </div>
    </div>
  );
}
