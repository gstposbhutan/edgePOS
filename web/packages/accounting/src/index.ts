/**
 * NEXUS BHUTAN - Accounting Package
 *
 * This package provides the 2026 GST Engine: ITC tracking,
 * Tax reconciliation, and PDF generation for Bhutanese compliance.
 *
 * @package @nexus-bhutan/accounting
 */

// GST Calculation Interface
export interface GSTCalculation {
  subtotal: number;
  gst_rate: number; // 5% flat rate for Bhutan 2026
  gst_amount: number;
  grand_total: number;
}

// Transaction Item Interface
export interface TransactionItem {
  sku: string;
  name: string;
  qty: number;
  rate: number;
  discount: number;
  gst_5: number;
  total: number;
}

// Calculate GST for Bhutan 2026 (5% flat rate)
export const calculateGST = (subtotal: number): GSTCalculation => {
  const gst_rate = 0.05; // 5% flat rate
  const gst_amount = subtotal * gst_rate;
  const grand_total = subtotal + gst_amount;

  return {
    subtotal,
    gst_rate,
    gst_amount,
    grand_total,
  };
};

// Calculate total for individual items
export const calculateItemTotal = (
  qty: number,
  rate: number,
  discount: number = 0
): TransactionItem => {
  const subtotal = qty * rate;
  const discount_amount = subtotal * (discount / 100);
  const taxable_amount = subtotal - discount_amount;
  const gst_5 = taxable_amount * 0.05;
  const total = taxable_amount + gst_5;

  return {
    sku: '', // To be populated
    name: '', // To be populated
    qty,
    rate,
    discount,
    gst_5,
    total,
  };
};

// Generate Invoice Number (SHOP-YYYY-SERIAL format)
export const generateInvoiceNumber = (shopId: string, year: number, serial: number): string => {
  return `${shopId}-${year}-${String(serial).padStart(6, '0')}`;
};

// Generate SHA-256 hash for digital signature
export const generateInvoiceHash = async (invoiceNo: string, grandTotal: number, sellerTPN: string): Promise<string> => {
  const data = `${invoiceNo}-${grandTotal}-${sellerTPN}`;

  // Use Web Crypto API for SHA-256
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
};
