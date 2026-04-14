import { getApiUrl, getAuthHeaders } from "./api";

export type Store = {
  id: string;
  name: string;
  slug: string;
  offlineModeEnabled: boolean;
  onlineStoreEnabled: boolean;
  financeModuleEnabled: boolean;
  mobileMenuShortcuts: string[];
  onlineStoreWhatsappNumber: string | null;
  onlineStoreWhatsappMessage: string | null;
  stockAlertLowColor: string;
  stockAlertOutColor: string;
  stockAlertOkColor: string;
  stockAlertLowThreshold: number;
  stockAlertAvailableThreshold: number;
  createdAt: string;
  updatedAt: string;
};

export type StoreUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string;
  createdAt: string;
  updatedAt: string;
};

export async function getStores(): Promise<Store[]> {
  const res = await fetch(getApiUrl("/admin/stores"), { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao listar lojas");
  return res.json();
}

export async function createStore(
  name: string,
  slug: string,
  options?: {
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
  }
): Promise<Store> {
  const res = await fetch(getApiUrl("/admin/stores"), {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify({ name, slug, ...options }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Falha ao criar loja");
  return data;
}

export async function updateStore(
  id: string,
  data: {
    name?: string;
    slug?: string;
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
  }
): Promise<Store> {
  const res = await fetch(getApiUrl(`/admin/stores/${id}`), {
    method: "PATCH",
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ?? "Falha ao atualizar loja");
  return out;
}

export async function deleteStore(id: string): Promise<void> {
  const res = await fetch(getApiUrl(`/admin/stores/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Falha ao excluir loja");
  }
}

export async function getStoreUsers(storeId: string): Promise<StoreUser[]> {
  const res = await fetch(getApiUrl(`/admin/stores/${storeId}/users`), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao listar usuários");
  return res.json();
}

export async function createStoreUser(
  storeId: string,
  data: { email: string; password: string; name: string }
): Promise<StoreUser> {
  const res = await fetch(getApiUrl(`/admin/stores/${storeId}/users`), {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ?? "Falha ao criar usuário");
  return out;
}

export async function updateUser(
  id: string,
  data: { name?: string; password?: string }
): Promise<StoreUser> {
  const res = await fetch(getApiUrl(`/admin/users/${id}`), {
    method: "PATCH",
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ?? "Falha ao atualizar usuário");
  return out;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(getApiUrl(`/admin/users/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Falha ao excluir usuário");
  }
}
