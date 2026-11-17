"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  OPERATOR: "Operator",
};

/**
 * "Profile" settings section: the signed-in user updates their own display
 * name. Email and role are read-only — role changes are an administrative
 * backend operation, and email is the account identifier.
 */
export function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the field in sync when the session user loads after mount. Keyed on
  // the user id (stable across re-renders) so user-object identity churn can
  // never clobber in-progress edits.
  const userId = user?.id;
  useEffect(() => {
    if (user && userId) setName((current) => (current === "" ? user.name : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const trimmed = name.trim();
  const clientError =
    trimmed.length === 0
      ? "Name is required"
      : trimmed.length > 100
        ? "Name must be at most 100 characters"
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || clientError) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile({ name: trimmed });
      toast.success("Profile updated");
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not update your profile. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={user?.email ?? ""} readOnly disabled />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your email is your sign-in identifier and cannot be changed here.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-role">Role</Label>
          <Input
            id="profile-role"
            value={user ? (ROLE_LABEL[user.role] ?? user.role) : ""}
            readOnly
            disabled
          />
        </div>
      </div>
      <div className="space-y-2 sm:max-w-sm">
        <Label htmlFor="profile-name">Display name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          aria-invalid={!!clientError}
        />
        {clientError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {clientError}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !!clientError || trimmed === (user?.name ?? "")}>
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save changes
      </Button>
    </form>
  );
}
