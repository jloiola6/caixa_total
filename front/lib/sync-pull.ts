import { getSyncState } from "./api"
import { applyServerState } from "./sync-conflict"
import { getStoredStoreId } from "./auth-api"

export async function pullFromServer(): Promise<{ synced: boolean }> {
  try {
    const storeId = getStoredStoreId() ?? undefined
    const serverState = await getSyncState(storeId)
    await applyServerState(serverState)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"))
    }
    return { synced: true }
  } catch {
    return { synced: false }
  }
}
