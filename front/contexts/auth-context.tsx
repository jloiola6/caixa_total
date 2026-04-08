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
import { pullFromServer } from "@/lib/sync-pull";
import { setOfflineModeEnabledForStore } from "@/lib/offline-mode";
import { clearLocalPushSubscription } from "@/lib/push-notifications";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  synced: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);

  const refreshUser = useCallback(async () => {
    const u = await getMe();
    setUser(u);
    if (!u) {
      clearStoredToken();
      setToken(null);
      return;
    }
    setStoredStoreId(u.storeId);
    if (u.storeId && typeof u.store?.offlineModeEnabled === "boolean") {
      setOfflineModeEnabledForStore(u.storeId, u.store.offlineModeEnabled);
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
      .then(async (u) => {
        setUser(u);
        if (u?.storeId) setStoredStoreId(u.storeId);
        if (u?.storeId && typeof u.store?.offlineModeEnabled === "boolean") {
          setOfflineModeEnabledForStore(u.storeId, u.store.offlineModeEnabled);
        }
        if (u) {
          const result = await pullFromServer();
          setSynced(result.synced);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const { token: newToken, user: newUser } = await authLogin(email, password);
      setStoredToken(newToken);
      setStoredStoreId(newUser.storeId);
      if (newUser.storeId && typeof newUser.store?.offlineModeEnabled === "boolean") {
        setOfflineModeEnabledForStore(newUser.storeId, newUser.store.offlineModeEnabled);
      }
      setToken(newToken);
      setUser(newUser);
      const result = await pullFromServer();
      setSynced(result.synced);
      return newUser;
    },
    []
  );

  const logout = useCallback(() => {
    void clearLocalPushSubscription().catch((error) => {
      console.error("Falha ao limpar assinatura local de push:", error);
    });
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
        synced,
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
