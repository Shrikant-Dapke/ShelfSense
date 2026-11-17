"use client";

import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, login as loginApi, logout as logoutApi, updateProfile as updateProfileApi, changePassword as changePasswordApi } from "./auth-api";
import type { SessionUser } from "@/lib/types";

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  updateProfile: (input: { name: string }) => Promise<SessionUser>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<SessionUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = async (email: string, password: string) => {
    const user = await loginApi(email, password);
    queryClient.setQueryData(["auth", "me"], user);
    return user;
  };

  const logout = async () => {
    await logoutApi();
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
    window.location.href = "/login";
  };

  const updateProfile = async (input: { name: string }) => {
    const user = await updateProfileApi(input);
    // Keep the cached session user in sync so the sidebar/header reflect the
    // new name immediately.
    queryClient.setQueryData(["auth", "me"], user);
    return user;
  };

  const changePassword = async (input: { currentPassword: string; newPassword: string }) => {
    // The server replaces the session cookie; identity is unchanged, but keep
    // the cache fresh all the same.
    const user = await changePasswordApi(input);
    queryClient.setQueryData(["auth", "me"], user);
    return user;
  };

  return (
    <AuthContext.Provider
      value={{ user: data ?? null, isLoading, login, logout, updateProfile, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
