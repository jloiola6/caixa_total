export const SYNC_CONFLICT_STATUS_EVENT = "sync:conflicts-status";
const SYNC_CONFLICT_COUNT_KEY = "caixatotal_sync_conflict_count";

type SyncConflictStatusDetail = {
  count: number;
};

export function getStoredSyncConflictCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(SYNC_CONFLICT_COUNT_KEY);
  const parsed = Number(raw ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

export function dispatchSyncConflictStatus(count: number) {
  if (typeof window === "undefined") return;
  const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  localStorage.setItem(SYNC_CONFLICT_COUNT_KEY, String(normalized));
  const event = new CustomEvent<SyncConflictStatusDetail>(SYNC_CONFLICT_STATUS_EVENT, {
    detail: { count: normalized },
  });
  window.dispatchEvent(event);
}
