"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system", resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme ?? theme) as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--ss-surface)",
          "--normal-text": "var(--ss-ink)",
          "--normal-border": "var(--ss-border)",
          "--success-bg": "var(--ss-surface)",
          "--success-text": "var(--status-success-ink)",
          "--success-border": "var(--status-success-border)",
          "--error-bg": "var(--ss-surface)",
          "--error-text": "var(--status-danger-ink)",
          "--error-border": "var(--status-danger-border)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast border-hairline text-ink shadow-lg group-[.toaster]:bg-surface group-[.toaster]:text-ink group-[.toaster]:border-hairline cn-toast",
          description: "group-[.toast]:text-ink-muted",
          actionButton: "group-[.toast]:bg-brand group-[.toast]:text-brand-ink",
          cancelButton: "group-[.toast]:bg-canvas group-[.toast]:text-ink-muted",
          success: "text-[var(--status-success-ink)]",
          error: "text-[var(--status-danger-ink)]",
          warning: "text-[var(--status-warning-ink)]",
          info: "text-[var(--status-info-ink)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
