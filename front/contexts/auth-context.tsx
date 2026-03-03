"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  login as authLogin,
  setStoredToken,
  setStoredStoreId,
  clearStoredToken,
  type AuthUser,
} from "@/lib/auth-api";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const u = await getMe();
    setUser(u);
    if (!u) {
      clearStoredToken();
      setToken(null);
    }
  }, []);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("caixatotal_token") : null;
    if (!t) {
      setLoading(false);
      return;
    }
    setToken(t);
    getMe()
      .then((u) => {
        setUser(u);
        if (u?.storeId) setStoredStoreId(u.storeId);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const { token: newToken, user: newUser } = await authLogin(email, password);
      setStoredToken(newToken);
      setStoredStoreId(newUser.storeId);
      setToken(newToken);
      setUser(newUser);
      return newUser;
    },
    []
  );

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
