import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@/types';
import { useData } from './DataContext';
import { verifyPassword } from '@/lib/hash';
import { can, type Permission } from './permissions';
import { SYSTEM_ACTOR } from './ops/shared';

/* ---------------------------------------------------------------------------
 * Authentication.
 * The session (current user id) lives in sessionStorage so it survives a page
 * reload but not a browser restart. Credentials are verified against the
 * SHA-256 hashes stored in the database.
 * ------------------------------------------------------------------------- */

const SESSION_KEY = 'optic-store-manager:session';

export type LoginError = 'invalid' | 'inactive';

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<LoginError | null>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(userId: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (userId) window.sessionStorage.setItem(SESSION_KEY, userId);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable – the session simply will not persist */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { users, setActor, markLogin } = useData();
  const [userId, setUserId] = useState<string | null>(readSession);

  const user = useMemo(() => users.find((item) => item.id === userId) ?? null, [users, userId]);

  // Keep the data layer's "actor" (audit trail) in sync with the session.
  useEffect(() => {
    setActor(user ? { id: user.id, name: user.fullName } : SYSTEM_ACTOR);
  }, [user, setActor]);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginError | null> => {
      const candidate = users.find((item) => item.username.toLowerCase() === username.trim().toLowerCase());
      if (!candidate) return 'invalid';
      const matches = await verifyPassword(password, candidate.salt, candidate.passwordHash);
      if (!matches) return 'invalid';
      if (!candidate.active) return 'inactive';
      setUserId(candidate.id);
      writeSession(candidate.id);
      markLogin(candidate.id);
      return null;
    },
    [users, markLogin],
  );


  const logout = useCallback(() => {
    setUserId(null);
    writeSession(null);
  }, []);

  const hasPermission = useCallback((permission: Permission) => can(user, permission), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: Boolean(user), login, logout, hasPermission }),
    [user, login, logout, hasPermission],
  );

  // Guard: if the signed-in user is deleted or disabled, drop the session.
  useEffect(() => {
    if (userId && !users.some((item) => item.id === userId && item.active)) {
      setUserId(null);
      writeSession(null);
    }
  }, [userId, users]);

  // Expose the current session to the app.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
