/// <reference path="../pb_data/types.d.ts" />

// Re-sync on change: when a synced row is updated for ANY reason other than the
// sync-mark itself, reset is_synced=false so the next push re-sends the change to
// the cloud. Without this, a cancel/refund (a status change) on an already-synced
// order would never propagate.
//
// CRITICAL — do NOT reset on doSync's own mark-synced flip (false → true), or
// is_synced could never stick and the row would re-push forever. So: allow the
// false→true flip; for every other update, mark the row dirty (is_synced=false).
onRecordUpdate((e) => {
  const wasSynced = e.record.original().getBool("is_synced")
  const nowSynced = e.record.getBool("is_synced")
  const isSyncMark = nowSynced === true && wasSynced === false
  if (!isSyncMark) {
    e.record.set("is_synced", false)
  }
  e.next()
}, "orders", "inventory_movements", "khata_transactions")
