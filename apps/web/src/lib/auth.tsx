"use client";

/**
 * Stubbed auth. The UI is real (Google button, session, protected routes);
 * the session itself is fake and lives in localStorage.
 *
 * SWAP POINT: replace `signInWithGoogle` / `signOut` / the hydration
 * effect with Supabase Auth (`supabase.auth.signInWithOAuth({ provider:
 * "google" })` etc.). Nothing else in the app should need to change.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface User {
  name: string;
  email: string;
  initials: string;
}

interface AuthState {
  user: User | null;
  /** false until the session has been read from storage (avoids redirect flicker) */
  ready: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => void;
}

const SESSION_KEY = "beta.session.v1";

const FAKE_USER: User = {
  name: "Anthony",
  email: "theant741@gmail.com",
  initials: "AN",
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw) as User);
    } catch {
      // ignore bad session
    }
    setReady(true);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // mimic the OAuth round-trip delay
    await new Promise((r) => setTimeout(r, 600));
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(FAKE_USER));
    setUser(FAKE_USER);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signInWithGoogle, signOut }),
    [user, ready, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
