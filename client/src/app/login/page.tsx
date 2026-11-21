"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError } from "@/lib/api-client";
import { resolveInternalPath } from "@/lib/safe-redirect";
import { Boxes, Eye, EyeOff, Loader2, ShieldCheck, ClipboardCheck, Timer } from "lucide-react";

function BrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-shell-sidebar p-12 text-white lg:flex lg:w-1/2">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand/5 blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-ink">
          <Boxes className="h-6 w-6" aria-hidden />
        </span>
        <span className="font-heading text-xl font-bold tracking-tight">
          Shelf<span className="text-brand">Sense</span>
        </span>
      </div>

      <div className="relative max-w-md space-y-5">
        <h2 className="font-heading text-4xl font-bold leading-tight tracking-tight">
          Smarter Inventory. Less Waste. Better Distribution.
        </h2>
        <p className="text-base leading-relaxed text-white/60">
          A single, auditable view of stock, expiry risk and warehouse operations —
          built on an immutable movement ledger.
        </p>
        <ul className="space-y-3 pt-2 text-sm text-white/70">
          {[
            { icon: ShieldCheck, label: "Ledger-verified balances" },
            { icon: Timer, label: "FEFO expiry intelligence" },
            { icon: ClipboardCheck, label: "Traceable, audited operations" },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.08] text-brand">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/40">
        Inventory Expiry &amp; Waste Reduction Platform
      </p>
    </aside>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `?next=` is honored only when it points at a safe internal path; external,
  // protocol-relative and encoded URLs fall back to the dashboard.
  const nextPath = resolveInternalPath(searchParams.get("next"));

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(nextPath);
    }
  }, [authLoading, user, router, nextPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace(nextPath);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Unable to sign in. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex min-h-svh flex-1 items-center justify-center bg-frame px-4 py-10 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-shell-sidebar text-brand">
            <Boxes className="h-6 w-6" aria-hidden />
          </span>
          <span className="font-heading text-xl font-bold tracking-tight text-ink">
            Shelf<span className="text-brand">Sense</span>
          </span>
        </div>

        <Card className="shadow-shell">
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
            <CardDescription>Sign in to your ShelfSense workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>
              {error ? (
                <p
                  id="login-error"
                  role="alert"
                  className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-soft)] px-3 py-2 text-sm text-[var(--status-danger-ink)]"
                >
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-xs text-ink-muted">
                Contact your administrator for account access.
              </p>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-[var(--ss-frame-muted)]">
          Smarter Inventory. Less Waste. Better Distribution.
        </p>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh">
      <BrandPanel />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
