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
    payments: { method: string; amountCents: number }[];
    items: { id: string; productName: string; sku: string | null; qty: number; lineTotalCents: number }[];
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
