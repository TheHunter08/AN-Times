export function updatedAtMs(item) {
  return Date.parse(item?._upd || item?.updatedAt || item?.updated_at || '') || 0
}

export function pickNewestSyncItem(serverItem, localItem) {
  if (!serverItem) return localItem
  if (!localItem) return serverItem
  return updatedAtMs(localItem) >= updatedAtMs(serverItem) ? localItem : serverItem
}
