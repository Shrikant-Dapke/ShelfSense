"use client";

import { apiFetch } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await apiFetch<{ user: SessionUser }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return res.data.user;
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  try {
    const res = await apiFetch<{ user: SessionUser }>("/auth/me");
    return res.data.user;
  } catch {
    return null;
  }
}
