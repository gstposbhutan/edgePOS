/**
 * NEXUS BHUTAN - Core Database Schema
 *
 * Multi-tenant foundation with Entity, Product, and Transaction tables
 * following Bhutan 2026 GST compliance requirements.
 */

import {
  pgTable,
  uuid,
  text,
  numeric,
  bigint,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// Multi-tenant Foundation - Every participant in the supply chain
export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  role: text('role').notNull(), // DISTRIBUTOR, WHOLESALER, RETAILER
  tpn_gstin: text('tpn_gstin').notNull().unique(), // Bhutanese Taxpayer Number
  whatsapp_no: text('whatsapp_no').notNull(), // E.164 format
  credit_limit: numeric('credit_limit').notNull().default('0'),
  parent_entity_id: uuid('parent_entity_id').references(() => entities.id), // Self-ref for hierarchy
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  tpnIdx: index('entities_tpn_idx').on(table.tpn_gstin),
  parentIdx: index('entities_parent_idx').on(table.parent_entity_id),
}));

// Central Brain Vector Library - Shared repository for product identification
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  hsn_code: text('hsn_code').notNull(), // Required for GST categorization
  image_embedding: text('image_embedding'), // Visual SKU matching (stored as JSON array string)
  current_stock: numeric('current_stock').notNull().default('0'),
  wholesale_price: numeric('wholesale_price').notNull().default('0'),
  mrp: numeric('mrp').notNull().default('0'), // 2026 regulated maximum retail price
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  hsnIdx: index('products_hsn_idx').on(table.hsn_code),
  stockIdx: index('products_stock_idx').on(table.current_stock),
}));

// Accounting Ledger - Tamper-proof record of every sale
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  inv_no: text('inv_no').notNull().unique(), // Formatted as SHOP-YYYY-SERIAL
  journal_no: bigint('journal_no', { mode: 'number' }).notNull(), // Sequential double-entry
  seller_id: uuid('seller_id').notNull().references(() => entities.id),
  buyer_hash: text('buyer_hash'), // Anonymized Face-ID embedding (stored as JSON array string)
  items: jsonb('items').notNull(), // Detailed snapshot: [{sku, name, qty, rate, discount, gst_5, total}]
  subtotal: numeric('subtotal').notNull().default('0'),
  gst_total: numeric('gst_total').notNull().default('0'), // Strict 5% flat calculation
  grand_total: numeric('grand_total').notNull().default('0'),
  payment_method: text('payment_method').notNull(), // MBOB, MPAY, RTGS, CASH, CREDIT
  ocr_verify_id: text('ocr_verify_id'), // Gemini's payment verification ID
  whatsapp_status: text('whatsapp_status').notNull().default('PENDING'), // SENT, DELIVERED, READ
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  invIdx: index('transactions_inv_idx').on(table.inv_no),
  sellerIdx: index('transactions_seller_idx').on(table.seller_id),
  createdIdx: index('transactions_created_idx').on(table.created_at),
}));

// Types for TypeScript
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;