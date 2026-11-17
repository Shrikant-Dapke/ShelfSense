"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { ProfileSection } from "@/features/settings/profile-section";
import { SecuritySection } from "@/features/settings/security-section";
import { PreferencesSection } from "@/features/settings/preferences-section";
import { AppearanceSection } from "@/features/settings/appearance-section";
import { AuditLogsSection } from "@/features/settings/audit-logs-section";
import { cn } from "@/lib/utils";
import { KeyRound, UserRound, SlidersHorizontal, Palette, ScrollText } from "lucide-react";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "security", label: "Security", icon: KeyRound },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "audit-logs", label: "Audit log", icon: ScrollText, adminOnly: true },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = can(user, "settings.admin");
  const visibleSections = SECTIONS.filter((s) => !("adminOnly" in s && s.adminOnly) || isAdmin);
  const [active, setActive] = useState<SectionId>("profile");
  const current = visibleSections.some((s) => s.id === active) ? active : "profile";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your account, device preferences and — for administrators — the audit log."
      />

      {/* Section switcher */}
      <nav
        aria-label="Settings sections"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
      >
        {visibleSections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            aria-current={current === id ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              current === id
                ? "bg-[#0d1f33] text-teal-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <section aria-label={current} className="space-y-4">
        {current === "profile" ? <ProfileSection /> : null}
        {current === "security" ? <SecuritySection /> : null}
        {current === "preferences" ? <PreferencesSection /> : null}
        {current === "appearance" ? <AppearanceSection /> : null}
        {current === "audit-logs" && isAdmin ? <AuditLogsSection /> : null}
      </section>
    </div>
  );
}
