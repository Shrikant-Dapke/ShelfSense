"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Client mirror of the server's shared password policy (auth.validation.ts):
 * min 8, max 200, at least one letter and one digit. The server enforces it
 * authoritatively; this exists only for instant feedback.
 */
function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 200) return "Password must be at most 200 characters";
  if (!/[A-Za-z]/.test(password)) return "Password must contain at least one letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  return null;
}

/**
 * "Security" settings section: change your own password. On success the
 * server rotates the session cookie AND invalidates every other session —
 * the toast says so explicitly, because other tabs/devices will be signed
 * out without warning.
 */
export function SecuritySection() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policyError = newPassword ? passwordPolicyError(newPassword) : null;
  const confirmError =
    confirmPassword && confirmPassword !== newPassword ? "Passwords do not match" : null;
  const canSubmit =
    !!currentPassword && !!newPassword && !policyError && !confirmError && confirmPassword !== "";

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      reset();
      toast.success("Password changed. You stay signed in here; all other sessions were signed out.");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError("Current password is incorrect.");
      } else {
        setError(err instanceof ApiClientError ? err.message : "Could not change your password. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 sm:max-w-sm" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password-current">Current password</Label>
        <Input
          id="password-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password-new">New password</Label>
        <Input
          id="password-new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          aria-invalid={!!policyError}
        />
        <p className="text-xs text-ink-muted">
          At least 8 characters, including a letter and a number.
        </p>
        {policyError ? (
          <p className="text-sm text-[var(--status-danger-ink)]" role="alert">
            {policyError}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password-confirm">Confirm new password</Label>
        <Input
          id="password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          aria-invalid={!!confirmError}
        />
        {confirmError ? (
          <p className="text-sm text-[var(--status-danger-ink)]" role="alert">
            {confirmError}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-[var(--status-danger-ink)]" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit}>
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Change password
      </Button>
    </form>
  );
}
