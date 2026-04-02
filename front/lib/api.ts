import type { PaymentMethod, ProductCategory } from "@/lib/types"

const getBaseUrl = () =>
  (typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "")
    : process.env.NEXT_PUBLIC_API_URL ?? "") || "http://localhost:4000";

export function getApiUrl(path: string): string {
  const base = getBaseUrl().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const TOKEN_KEY = "caixatotal_token";

export function getAuthHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export type ServerSyncState = {
  products: { id: string; updatedAt: string; [key: string]: unknown }[];
  sales: { id: string; createdAt: string; [key: string]: unknown }[];
  sale_items: { id: string; [key: string]: unknown }[];
  sale_payments: { id: string; [key: string]: unknown }[];
  stock_logs: { id: string; createdAt: string; [key: string]: unknown }[];
};

export type ServerNotification = {
  id: string;
  type: "sale_created";
  title: string;
  message: string;
  saleId: string | null;
  saleCreatedAt: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function getSyncState(storeId?: string): Promise<ServerSyncState> {
  const since = "1970-01-01T00:00:00.000Z";
  let url = getApiUrl(`/sync?since=${encodeURIComponent(since)}`);
  if (storeId) url += `&storeId=${encodeURIComponent(storeId)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Falha ao obter dados do servidor: ${res.status}`);
  return res.json();
}

export async function postSync(
  payload: {
    products: unknown[];
    sales: unknown[];
    sale_items: unknown[];
    stock_logs: unknown[];
  },
  storeId?: string
): Promise<{ ok: boolean; serverTime?: string }> {
  const body = storeId ? { ...payload, storeId } : payload;
  const res = await fetch(getApiUrl("/sync"), {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  return res.json();
}

export async function getReportSummary(
  start: string,
  end: string,
  storeId?: string
): Promise<{ date: string; totalCents: number; salesCount: number; itemsCount: number }[]> {
  let url = getApiUrl(
    `/report/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
  if (storeId) url += `&storeId=${encodeURIComponent(storeId)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  return res.json();
}

export async function getReportSales(
  start: string,
  end: string,
  storeId?: string
): Promise<
  {
    id: string;
    createdAt: string;
    totalCents: number;
    itemsCount: number;
    customerName: string | null;
    customerPhone: string | null;
    payments: { method: PaymentMethod; amountCents: number }[];
    items: {
      id: string;
      saleId: string;
      productId: string;
      productName: string;
      sku: string | null;
      qty: number;
      unitPriceCents: number;
      lineTotalCents: number;
      productCategory: ProductCategory | null;
    }[];
  }[]
> {
  let url = getApiUrl(
    `/report/sales?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
  if (storeId) url += `&storeId=${encodeURIComponent(storeId)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  return res.json();
}

export async function getReportTopProducts(
  start: string,
  end: string,
  limit = 10,
  storeId?: string
): Promise<{ productId: string; productName: string; totalQty: number; totalCents: number }[]> {
  let url = getApiUrl(
    `/report/top-products?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=${limit}`
  );
  if (storeId) url += `&storeId=${encodeURIComponent(storeId)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  return res.json();
}

export async function getNotifications(
  params?: { limit?: number; unreadOnly?: boolean; storeId?: string }
): Promise<ServerNotification[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.unreadOnly) query.set("unreadOnly", "1");
  if (params?.storeId) query.set("storeId", params.storeId);

  const qs = query.toString();
  const res = await fetch(getApiUrl(`/notifications${qs ? `?${qs}` : ""}`), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Notifications failed: ${res.status}`);
  return res.json();
}

export async function getUnreadNotificationsCount(
  params?: { storeId?: string }
): Promise<number> {
  const query = new URLSearchParams();
  if (params?.storeId) query.set("storeId", params.storeId);
  const qs = query.toString();
  const res = await fetch(
    getApiUrl(`/notifications/unread-count${qs ? `?${qs}` : ""}`),
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error(`Unread notifications failed: ${res.status}`);
  const data = (await res.json()) as { unreadCount?: number };
  return Number(data.unreadCount ?? 0);
}

export async function markNotificationAsRead(
  id: string,
  params?: { storeId?: string }
): Promise<void> {
  const query = new URLSearchParams();
  if (params?.storeId) query.set("storeId", params.storeId);
  const qs = query.toString();
  const res = await fetch(
    getApiUrl(`/notifications/${encodeURIComponent(id)}/read${qs ? `?${qs}` : ""}`),
    {
      method: "PATCH",
      headers: getAuthHeaders(true),
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) throw new Error(`Mark notification read failed: ${res.status}`);
}

export async function markAllNotificationsAsRead(
  params?: { storeId?: string }
): Promise<void> {
  const query = new URLSearchParams();
  if (params?.storeId) query.set("storeId", params.storeId);
  const qs = query.toString();
  const res = await fetch(
    getApiUrl(`/notifications/read-all${qs ? `?${qs}` : ""}`),
    {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) throw new Error(`Mark all notifications read failed: ${res.status}`);
}
