/**
 * NEXUS BHUTAN POS Terminal - Database Integration
 *
 * Example usage of the database package in the POS terminal.
 * This demonstrates how to interact with the Supabase database
 * using Drizzle ORM for GST 2026 compliant operations.
 */

import { db } from '@nexus-bhutan/database';
import { entities, products, transactions } from '@nexus-bhutan/database';
import { eq, desc } from 'drizzle-orm';

// Example: Get all retailers for a wholesaler
export async function getRetailers(wholesalerId: string) {
  const retailers = await db
    .select()
    .from(entities)
    .where(eq(entities.parent_entity_id, wholesalerId));

  return retailers;
}

// Example: Create a new transaction with GST calculation
export async function createTransaction(transactionData: {
  seller_id: string;
  items: Array<{
    sku: string;
    name: string;
    qty: number;
    rate: number;
    discount: number;
    gst_5: number;
    total: number;
  }>;
  payment_method: 'MBOB' | 'MPAY' | 'RTGS' | 'CASH' | 'CREDIT';
}) {
  // Calculate totals
  const subtotal = transactionData.items.reduce((sum, item) => sum + item.total, 0);
  const gst_total = subtotal * 0.05; // 5% GST for Bhutan 2026
  const grand_total = subtotal + gst_total;

  // Generate invoice number
  const inv_no = `SHOP-${new Date().getFullYear()}-${Date.now()}`;

  // Insert transaction
  const [newTransaction] = await db
    .insert(transactions)
    .values({
      inv_no,
      seller_id: transactionData.seller_id,
      items: transactionData.items as any,
      subtotal: subtotal.toString(),
      gst_total: gst_total.toString(),
      grand_total: grand_total.toString(),
      payment_method: transactionData.payment_method,
      whatsapp_status: 'PENDING',
    })
    .returning();

  return newTransaction;
}

// Example: Get product by ID with current stock
export async function getProduct(productId: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return product;
}

// Example: Update product stock (for inventory management)
export async function updateProductStock(
  productId: string,
  quantity: number,
  movementType: 'SALE' | 'RESTOCK' | 'TRANSFER' | 'LOSS' | 'DAMAGED'
) {
  // This would be implemented with inventory_movements table
  // For now, just updating the product stock
  const [updatedProduct] = await db
    .update(products)
    .set({
      current_stock: quantity.toString(),
      updated_at: new Date(),
    })
    .where(eq(products.id, productId))
    .returning();

  return updatedProduct;
}

// Example: Get recent transactions for a seller
export async function getRecentTransactions(sellerId: string, limit = 10) {
  const recentTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.seller_id, sellerId))
    .orderBy(desc(transactions.created_at))
    .limit(limit);

  return recentTransactions;
}

// Export database instance for direct usage
export { db };