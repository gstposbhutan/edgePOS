/**
 * NEXUS BHUTAN POS — Shared Constants
 * Central source of truth for all magic strings, enums, and configuration values.
 */

export const CART_STATUS = {
  ACTIVE: "ACTIVE",
  CONVERTED: "CONVERTED",
  ABANDONED: "ABANDONED",
} as const;
export type CartStatus = (typeof CART_STATUS)[keyof typeof CART_STATUS];

export const ORDER_STATUS = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// Canonical payment methods (P1-1) — must match the web app's
// orders.payment_method values (CASH | CREDIT | ONLINE) so desktop orders sync
// to Supabase without a CHECK violation.
export const PAYMENT_METHOD = {
  CASH: "CASH",
  CREDIT: "CREDIT",
  ONLINE: "ONLINE",
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// Sub-channel for ONLINE payments — preserves the wallet/rail (mBoB/mPay/RTGS)
// for receipts and reporting without breaking the canonical method enum.
export const PAYMENT_CHANNEL = {
  MBOB: "MBOB",
  MPAY: "MPAY",
  RTGS: "RTGS",
} as const;
export type PaymentChannel = (typeof PAYMENT_CHANNEL)[keyof typeof PAYMENT_CHANNEL];

// UI payment options → canonical (method, channel). mBoB/mPay/RTGS all map to
// ONLINE with a distinguishing channel; cash/credit have no channel.
export const PAYMENT_METHODS = [
  { id: "cash",   label: "Cash",           method: PAYMENT_METHOD.CASH,   channel: null },
  { id: "mbob",   label: "mBoB",           method: PAYMENT_METHOD.ONLINE, channel: PAYMENT_CHANNEL.MBOB },
  { id: "mpay",   label: "mPay",           method: PAYMENT_METHOD.ONLINE, channel: PAYMENT_CHANNEL.MPAY },
  { id: "rtgs",   label: "RTGS",           method: PAYMENT_METHOD.ONLINE, channel: PAYMENT_CHANNEL.RTGS },
  { id: "credit", label: "Khata / Credit", method: PAYMENT_METHOD.CREDIT, channel: null },
] as const;

export const DENOMINATIONS = [10, 50, 100, 500, 1000] as const;

export const MOVEMENT_TYPE = {
  SALE: "SALE",
  RESTOCK: "RESTOCK",
  TRANSFER: "TRANSFER",
  RETURN: "RETURN",
  LOSS: "LOSS",
  DAMAGED: "DAMAGED",
} as const;
export type MovementType = (typeof MOVEMENT_TYPE)[keyof typeof MOVEMENT_TYPE];

export const ADJUSTMENT_TYPES = [
  { value: MOVEMENT_TYPE.RESTOCK, label: "Restock" },
  { value: MOVEMENT_TYPE.LOSS, label: "Loss" },
  { value: MOVEMENT_TYPE.DAMAGED, label: "Damaged" },
  { value: MOVEMENT_TYPE.TRANSFER, label: "Transfer" },
] as const;

export const KHATA_TXN = {
  DEBIT: "DEBIT",
  CREDIT: "CREDIT",
  ADJUSTMENT: "ADJUSTMENT",
} as const;

export const CASH_ADJUSTMENT_TYPE = {
  CASH_IN: "CASH_IN",
  CASH_OUT: "CASH_OUT",
} as const;
export type CashAdjustmentType = (typeof CASH_ADJUSTMENT_TYPE)[keyof typeof CASH_ADJUSTMENT_TYPE];

export const CASH_ADJUSTMENT_REASON = {
  PETTY_CASH: "Petty Cash",
  OFFICE_EXPENSE: "Office Expense",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  DRAWER_CORRECTION: "Drawer Correction",
  OTHER: "Other",
} as const;

export const SHIFT_STATUS = {
  ACTIVE: "active",
  CLOSING: "closing",
  CLOSED: "closed",
} as const;

export const ORDER_FILTERS = ["all", "today", "confirmed", "cancelled", "refunded"] as const;

export const DEFAULT_GST_RATE = 5;
export const MAX_HELD_CARTS = 10;
export const MAX_UNDO_STACK = 20;
export const NUMPAD_MAX_VALUE = 999;
export const RECEIPT_AUTO_CLOSE_MS = 8000;
export const TAP_FEEDBACK_MS = 600;
export const SCREEN_LG = 1024;

export const CART_WIDTH = {
  COMPACT: "w-[340px]",
  STANDARD: "w-[380px]",
  FULL: "w-[480px]",
} as const;

export const LAYOUT_PRESETS = {
  STANDARD: "standard",
  COMPACT: "compact",
  FULLCART: "fullcart",
} as const;
export type LayoutPreset = (typeof LAYOUT_PRESETS)[keyof typeof LAYOUT_PRESETS];

export const LS_KEYS = {
  FAVORITES: "nexus_pos_favorites",
  HELD_CARTS: "nexus_pos_held_carts",
  LAYOUT: "nexus_pos_layout",
} as const;

export const PB_REQ = { requestKey: null };
