"use client";
import { useState, useEffect, useCallback, createContext, useContext } from "react";

export type UserProfile = {
  name: string;
  email: string;
  password: string;
  loggedInAt: string;
};

type AuthCtx = {
  user: UserProfile | null;
  login: (name: string, email: string, password: string) => { ok: boolean; error?: string };
  signup: (name: string, email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  updateProfile: (fields: Partial<Pick<UserProfile, "name" | "email" | "password">>) => void;
  changePassword: (oldPw: string, newPw: string) => { ok: boolean; error?: string };
};

const KEY = "dari-sir-user";
const Ctx = createContext<AuthCtx>({
  user: null,
  login: () => ({ ok: false }),
  signup: () => ({ ok: false }),
  logout: () => {},
  updateProfile: () => {},
  changePassword: () => ({ ok: false }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const save = useCallback((u: UserProfile | null) => {
    setUser(u);
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else localStorage.removeItem(KEY);
  }, []);

  const login = useCallback(
    (name: string, email: string, password: string) => {
      const existing = localStorage.getItem(KEY);
      if (existing) {
        const u: UserProfile = JSON.parse(existing);
        if (u.email === email && u.password === password) {
          save({ ...u, loggedInAt: new Date().toISOString() });
          return { ok: true };
        }
        return { ok: false, error: "Invalid email or password" };
      }
      const u: UserProfile = { name, email, password, loggedInAt: new Date().toISOString() };
      save(u);
      return { ok: true };
    },
    [save]
  );

  const signup = useCallback(
    (name: string, email: string, password: string) => {
      if (!name.trim()) return { ok: false, error: "Name is required" };
      if (!email.trim()) return { ok: false, error: "Email is required" };
      if (password.length < 4) return { ok: false, error: "Password must be at least 4 characters" };
      const u: UserProfile = { name, email, password, loggedInAt: new Date().toISOString() };
      save(u);
      return { ok: true };
    },
    [save]
  );

  const logout = useCallback(() => save(null), [save]);

  const updateProfile = useCallback(
    (fields: Partial<Pick<UserProfile, "name" | "email" | "password">>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...fields };
        localStorage.setItem(KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const changePassword = useCallback(
    (oldPw: string, newPw: string) => {
      if (!user) return { ok: false, error: "Not logged in" };
      if (user.password !== oldPw) return { ok: false, error: "Current password is incorrect" };
      if (newPw.length < 4) return { ok: false, error: "Password must be at least 4 characters" };
      const updated = { ...user, password: newPw };
      localStorage.setItem(KEY, JSON.stringify(updated));
      setUser(updated);
      return { ok: true };
    },
    [user]
  );

  return <Ctx.Provider value={{ user, login, signup, logout, updateProfile, changePassword }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
