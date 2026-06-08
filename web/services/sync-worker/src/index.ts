/**
 * NEXUS BHUTAN - Sync Worker Service
 *
 * This background service handles PouchDB-to-Supabase synchronization
 * for offline-resilient operations across the POS ecosystem.
 *
 * @package sync-worker
 */

// Sync status interface
export interface SyncStatus {
  lastSyncTime: Date;
  pendingChanges: number;
  syncInProgress: boolean;
  conflicts: number;
}

// Sync worker class
class SyncWorker {
  private syncInterval: number = 60000; // 1 minute
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startSyncWorker();
  }

  // Start the sync worker
  startSyncWorker() {
    console.log('Starting Sync Worker service...');

    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.syncInterval);
  }

  // Perform synchronization
  async performSync(): Promise<SyncStatus> {
    try {
      console.log('Performing sync...');

      // Register + order mapping sketch — see ./register-order-sync.ts:
      //   1. For each terminal with unsynced rows (pushed here, or pulled from its
      //      PocketBase), assemble a TerminalBatch { entityId, registers, orders }.
      //   2. syncTerminalBatch(supabase, batch): upserts registers by
      //      (entity_id, machine_id) → builds a local→cloud register id map →
      //      upserts orders by order_no, remapping register_id + stamping seller_id.
      //   3. Mark the terminal's rows synced (e.g. is_synced=true) and advance a cursor.
      // TODO (blockers): wire a Supabase service client + terminal transport/auth;
      //   extend to order_items / inventory_movements / khata. TRIGGER SAFETY is
      //   handled (origin='TERMINAL_SYNC' + Migration 074 WHEN-guards on the confirm
      //   triggers); the remaining khata follow-up is reconciling the cloud balance
      //   from synced khata_transactions. Verify digital_signature on ingest (P1-3).

      return {
        lastSyncTime: new Date(),
        pendingChanges: 0,
        syncInProgress: false,
        conflicts: 0,
      };
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }

  // Stop the sync worker
  stopSyncWorker() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Manual sync trigger
  async triggerManualSync(): Promise<SyncStatus> {
    console.log('Triggering manual sync...');
    return this.performSync();
  }
}

// Start the sync worker if this is the main module
if (require.main === module) {
  const syncWorker = new SyncWorker();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Stopping Sync Worker service...');
    syncWorker.stopSyncWorker();
    process.exit(0);
  });
}

export default SyncWorker;
