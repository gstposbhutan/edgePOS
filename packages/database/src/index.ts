/**
 * NEXUS BHUTAN - Database Package
 *
 * This package provides shared database schemas, Supabase client configuration,
 * and migration scripts for the entire NEXUS BHUTAN ecosystem.
 *
 * @package @nexus-bhutan/database
 */

// Supabase client configuration
export const createSupabaseClient = (url: string, key: string) => {
  // Placeholder for Supabase client initialization
  return { url, key };
};

// Database schema types (to be implemented with Prisma/Drizzle)
export interface Entity {
  id: string;
  name: string;
  role: 'DISTRIBUTOR' | 'WHOLESALER' | 'RETAILER';
  tpn_gstin: string;
  whatsapp_no: string;
  credit_limit: number;
  parent_entity_id?: string;
}

export interface Product {
  id: string;
  name: string;
  hsn_code: string;
  image_embedding: number[];
  current_stock: number;
  wholesale_price: number;
  mrp: number;
}

export interface Transaction {
  id: string;
  inv_no: string;
  journal_no: bigint;
  seller_id: string;
  buyer_hash: number[];
  items: any[];
  subtotal: number;
  gst_total: number;
  grand_total: number;
  payment_method: 'MBOB' | 'MPAY' | 'RTGS' | 'CASH' | 'CREDIT';
  ocr_verify_id?: string;
  whatsapp_status: 'SENT' | 'DELIVERED' | 'READ';
}
