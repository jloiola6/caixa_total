import { getApiUrl, isTransientFetchError } from "./api";

const TOKEN_KEY = "caixatotal_token";
const AUTH_USER_KEY = "caixatotal_auth_user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

const STORE_ID_KEY = "caixatotal_storeId";

export function setStoredStoreId(storeId: string | null): void {
  if (storeId) localStorage.setItem(STORE_ID_KEY, storeId);
  else localStorage.removeItem(STORE_ID_KEY);
}

export function getStoredStoreId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORE_ID_KEY);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STORE_ID_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "STORE_USER";
  storeId: string | null;
  store: {
    id: string;
    name: string;
    slug: string;
    offlineModeEnabled?: boolean;
    onlineStoreEnabled?: boolean;
    financeModuleEnabled?: boolean;
    mobileMenuShortcuts?: string[];
    onlineStoreWhatsappNumber?: string | null;
    onlineStoreWhatsappMessage?: string | null;
    stockAlertLowColor?: string;
    stockAlertOutColor?: string;
    stockAlertOkColor?: string;
    stockAlertLowThreshold?: number;
    stockAlertAvailableThreshold?: number;
  } | null;
};

export function getStoredAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
}

export function setStoredAuthUser(user: AuthUser | null): void {
  if (!user) {
    localStorage.removeItem(AUTH_USER_KEY);
    return;
  }
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

async function parseJsonWithFallback(
  res: Response,
  fallbackMessage: string
): Promise<Record<string, unknown>> {
  const bodyText = await res.text();
  let data: Record<string, unknown> = {};

  if (bodyText) {
    try {
      data = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      if (!res.ok) throw new Error(`${fallbackMessage} (HTTP ${res.status})`);
      throw new Error("Resposta inválida do servidor");
    }
  }

  if (!res.ok) {
    const errorMessage =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : `${fallbackMessage} (HTTP ${res.status})`;
    throw new Error(errorMessage);
  }

  return data;
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(getApiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonWithFallback(res, "Falha no login");

  if (typeof data.token !== "string" || !data.user) {
    throw new Error("Resposta inválida do servidor");
  }

  return { token: data.token, user: data.user as AuthUser };
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(getApiUrl("/auth/forgot-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await parseJsonWithFallback(res, "Falha ao enviar");
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(getApiUrl("/auth/reset-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  await parseJsonWithFallback(res, "Falha ao redefinir senha");
}

export async function getMe(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  let res: Response;
  try {
    res = await fetch(getApiUrl("/auth/me"), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (isTransientFetchError(error)) throw error;
    throw error;
  }

  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    throw new Error(`Falha ao validar sessao: ${res.status}`);
  }
  return res.json();
}

export async function updateMyStoreSettings(data: {
  onlineStoreWhatsappNumber?: string | null;
  onlineStoreWhatsappMessage?: string | null;
  mobileMenuShortcuts?: string[];
  stockAlertLowColor?: string;
  stockAlertOutColor?: string;
  stockAlertOkColor?: string;
  stockAlertLowThreshold?: number;
  stockAlertAvailableThreshold?: number;
}): Promise<NonNullable<AuthUser["store"]>> {
  const token = getStoredToken();
  if (!token) throw new Error("Usuário não autenticado");
  const res = await fetch(getApiUrl("/auth/me/store-settings"), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const out = await parseJsonWithFallback(res, "Falha ao salvar configurações da loja");
  return out as NonNullable<AuthUser["store"]>;
}
