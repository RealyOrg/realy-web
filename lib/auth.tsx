"use client";

/**
 * Auth context — provides the current company user and login/logout helpers.
 *
 * Wrap the app (or dashboard layout) with <AuthProvider>.
 * Use the useAuth() hook to access auth state anywhere.
 *
 * The token is stored in both localStorage (for API calls) and a cookie
 * named "relay_token" (for Next.js middleware route protection).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  getToken,
  setToken,
  clearToken,
  loginCompany,
  registerCompany,
  getMe,
} from "@/lib/api";
import type { AuthUser } from "@/types";

// ── Cookie helpers ────────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days = 0.5): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, try to restore session from stored token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => {
        clearToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokenData = await loginCompany(email, password);
    setToken(tokenData.access_token);
    setCookie("relay_token", tokenData.access_token);
    const me = await getMe();
    setUser(me);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await registerCompany(name, email, password);
      // Auto-login after registration
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    clearToken();
    deleteCookie("relay_token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
