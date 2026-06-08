// The reconciliation now lives in the shared package @nexus-bhutan/sync-core
// (web/packages/sync-core). It is re-exported here for compatibility; the canonical
// consumer is the web ingest route (web/app/api/sync/ingest). The worker's standalone
// build therefore depends on @nexus-bhutan/sync-core being built/installed.
export * from '@nexus-bhutan/sync-core'
