"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * "Appearance" settings section: light / dark / system via next-themes
 * (class strategy on <html>, default light). The choice is device-local.
 * Theme-dependent UI is gated on `mounted` to avoid hydration mismatch.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-2 sm:max-w-md">
      <Label htmlFor="appearance-theme">Theme</Label>
      <div
        id="appearance-theme"
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#0d1f33] text-teal-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        "System" follows your operating system preference. Stored only in this browser.
      </p>
    </div>
  );
}
