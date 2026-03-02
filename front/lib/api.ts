const getBaseUrl = () =>
  (typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "")
    : process.env.NEXT_PUBLIC_API_URL ?? "") || "http://localhost:4000";

export function getApiUrl(path: string): string {
  const base = getBaseUrl().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export type ServerSyncState = {
  products: { id: string; updatedAt: string; [key: string]: unknown }[];
  sales: { id: string; createdAt: string; [key: string]: unknown }[];
  sale_items: { id: string; [key: string]: unknown }[];
  sale_payments: { id: string; [key: string]: unknown }[];
  stock_logs: { id: string; createdAt: string; [key: string]: unknown }[];
};

export async function getSyncState(): Promise<ServerSyncState> {
  const since = "1970-01-01T00:00:00.000Z";
  const res = await fetch(getApiUrl(`/sync?since=${encodeURIComponent(since)}`));
  if (!res.ok) throw new Error(`Falha ao obter dados do servidor: ${res.status}`);
  return res.json();
}

export async function postSync(payload: {
  products: unknown[];
  sales: unknown[];
  sale_items: unknown[];
  stock_logs: unknown[];
}): Promise<{ ok: boolean; serverTime?: string }> {
  const res = await fetch(getApiUrl("/sync"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  return res.json();
}

export async function getReportSummary(
  start: string,
  end: string
): Promise<{ date: string; totalCents: number; salesCount: number; itemsCount: number }[]> {
  const url = getApiUrl(
    `/report/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  return res.json();
}

export async function getReportSales(
  start: string,
  end: string
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
  const url = getApiUrl(
    `/report/sales?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  return res.json();
}

export async function getReportTopProducts(
  start: string,
  end: string,
  limit = 10
): Promise<{ productId: string; productName: string; totalQty: number; totalCents: number }[]> {
  const url = getApiUrl(
    `/report/top-products?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=${limit}`
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  return res.json();
}
