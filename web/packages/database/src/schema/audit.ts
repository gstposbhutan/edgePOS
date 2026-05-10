/**
 * NEXUS BHUTAN - Audit & Compliance Schema
 *
 * Audit logs and inventory movement tracking for compliance
 * and fraud detection as required by Bhutan 2026 GST regulations.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { entities } from './core';

// Compliance + fraud detection tracking
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  table_name: text('table_name').notNull(),
  record_id: uuid('record_id').notNull(),
  operation: text('operation').notNull(), // INSERT, UPDATE, DELETE
  old_values: jsonb('old_values'), // Previous state
  new_values: jsonb('new_values'), // New state
  actor_id: uuid('actor_id').references(() => entities.id),
  timestamp: timestamp('timestamp').defaultNow(),
}, (table) => ({
  tableIdx: index('audit_logs_table_idx').on(table.table_name),
  recordIdx: index('audit_logs_record_idx').on(table.record_id),
  actorIdx: index('audit_logs_actor_idx').on(table.actor_id),
  timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp),
}));

// Stock flow tracking for reconciliation
export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  product_id: uuid('product_id').notNull(),
  entity_id: uuid('entity_id').notNull().references(() => entities.id),
  movement_type: text('movement_type').notNull(), // SALE, RESTOCK, TRANSFER, LOSS, DAMAGED
  quantity: integer('quantity').notNull(),
  reference_id: uuid('reference_id'), // transaction_id or transfer_id
  timestamp: timestamp('timestamp').defaultNow(),
  notes: text('notes'),
}, (table) => ({
  productIdx: index('inventory_movements_product_idx').on(table.product_id),
  entityIdx: index('inventory_movements_entity_idx').on(table.entity_id),
  typeIdx: index('inventory_movements_type_idx').on(table.movement_type),
  timestampIdx: index('inventory_movements_timestamp_idx').on(table.timestamp),
}));

// Types for TypeScript
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;