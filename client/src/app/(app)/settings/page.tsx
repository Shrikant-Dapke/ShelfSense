"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { can } from "@/features/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const SECTION_META: Record<SectionId, { title: string; description: string }> = {
  profile: {
    title: "Profile",
    description: "Manage the identity shown across ShelfSense.",
  },
  security: {
    title: "Security",
    description: "Update your password and keep your account secure.",
  },
  preferences: {
    title: "Preferences",
    description: "Defaults stored on this device only — never sent to the server.",
  },
  appearance: {
    title: "Appearance",
    description: "Choose how ShelfSense looks on this device.",
  },
  "audit-logs": {
    title: "Audit log",
    description: "Administrative events from the authoritative audit trail.",
  },
};

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
        className="inline-flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface p-1.5 shadow-surface"
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
                ? "bg-brand text-brand-ink"
                : "text-ink-muted hover:bg-canvas hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle>{SECTION_META[current].title}</CardTitle>
          <CardDescription>{SECTION_META[current].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {current === "profile" ? <ProfileSection /> : null}
          {current === "security" ? <SecuritySection /> : null}
          {current === "preferences" ? <PreferencesSection /> : null}
          {current === "appearance" ? <AppearanceSection /> : null}
          {current === "audit-logs" && isAdmin ? <AuditLogsSection /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
