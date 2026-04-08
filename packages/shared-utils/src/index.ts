/**
 * NEXUS BHUTAN - Shared Utils Package
 *
 * This package provides common TypeScript types, validation logic,
 * and currency formatters used across the NEXUS BHUTAN ecosystem.
 *
 * @package @nexus-bhutan/shared-utils
 */

// Common validation schemas using Zod
export const entitySchema = {
  validate: (data: any) => {
    // Placeholder for Zod validation
    return { valid: true, data };
  }
};

// Currency formatting for Bhutanese Ngultrum (BTN)
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-BT', {
    style: 'currency',
    currency: 'BTN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Phone number validation for Bhutan (+975)
export const validateBhutanPhone = (phone: string): boolean => {
  const bhutanPhoneRegex = /^(\+975)?[17][- ]?\d{2}[- ]?\d{6}$/;
  return bhutanPhoneRegex.test(phone);
};

// TPN (Taxpayer Number) validation for Bhutan GST
export const validateTPN = (tpn: string): boolean => {
  // Basic format validation for Bhutanese TPN
  const tpnRegex = /^\d{11,13}$/;
  return tpnRegex.test(tpn);
};

// Date formatting for Bhutan
export const formatBhutanDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-BT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

// Calculate ITC (Input Tax Credit) for B2B transactions
export const calculateITC = (gstAmount: number, isB2B: boolean): number => {
  if (!isB2B) return 0;
  return gstAmount; // Full GST amount becomes ITC for B2B transactions
};

// Stock threshold validation
export const isLowStock = (currentStock: number, threshold: number = 0.15): boolean => {
  return currentStock <= threshold;
};

// Generate readable transaction ID
export const generateTransactionId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `TXN-${timestamp}-${randomStr}`.toUpperCase();
};
