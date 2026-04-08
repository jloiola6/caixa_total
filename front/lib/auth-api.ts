import { getApiUrl } from "./api";

const TOKEN_KEY = "caixatotal_token";

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
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "STORE_USER";
  storeId: string | null;
  store: { id: string; name: string; slug: string; offlineModeEnabled?: boolean } | null;
};

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
  const res = await fetch(getApiUrl("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}
