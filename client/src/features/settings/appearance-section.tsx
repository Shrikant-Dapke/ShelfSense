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
        className="inline-flex rounded-xl border border-hairline bg-surface p-1.5 shadow-surface"
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
                  ? "bg-brand text-brand-ink"
                  : "text-ink-muted hover:bg-canvas hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">
        "System" follows your operating system preference. Stored only in this browser.
      </p>
    </div>
  );
}
