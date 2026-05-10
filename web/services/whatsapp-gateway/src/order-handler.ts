/**
 * WhatsApp Order Handler
 *
 * Processes incoming WhatsApp messages into DRAFT orders.
 * Pipeline: rate-limit → parse → fuzzy-match → create order → reply.
 *
 * @module order-handler
 */

import { parseOrderMessage, fuzzyMatchProducts, FuzzyMatchResult } from './order-parser';

interface OrderResult {
  success: boolean;
  orderId?: string;
  orderNo?: string;
  error?: string;
  matched: number;
  unmatched: number;
}

/**
 * Handle an incoming WhatsApp order message.
 */
export async function handleIncomingOrder(
  supabase: any,
  phone: string,
  messageText: string,
  messageId: string,
  storeRef: string | null,
  sendReply: (phone: string, text: string) => Promise<void>
): Promise<OrderResult> {
  try {
    // 1. Rate-limit check: 10 orders/day/phone
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_phone', phone)
      .eq('order_source', 'WHATSAPP')
      .gte('created_at', today);

    if ((count ?? 0) >= 10) {
      await sendReply(phone, "You've reached the daily order limit (10). Please try again tomorrow.");
      return { success: false, error: 'Rate limit exceeded', matched: 0, unmatched: 0 };
    }

    // 2. Parse message
    const parsedItems = parseOrderMessage(messageText);
    if (parsedItems.length === 0) {
      await sendReply(phone, "We couldn't find any items in your message. Please list products like:\n2x Product Name\nProduct Name x3");
      return { success: false, error: 'No items parsed', matched: 0, unmatched: 0 };
    }

    // 3. Resolve store
    let entityId: string | null = null;
    let entityName: string = 'Store';

    if (storeRef) {
      // Try by shop_slug first, then by entity id
      const { data: bySlug } = await supabase
        .from('entities')
        .select('id, name')
        .eq('shop_slug', storeRef)
        .eq('is_active', true)
        .single();

      if (bySlug) {
        entityId = bySlug.id;
        entityName = bySlug.name;
      } else {
        const { data: byId } = await supabase
          .from('entities')
          .select('id, name')
          .eq('id', storeRef)
          .eq('is_active', true)
          .single();
        if (byId) {
          entityId = byId.id;
          entityName = byId.name;
        }
      }
    }

    if (!entityId) {
      await sendReply(phone, "Sorry, we couldn't identify the store. Please order from the marketplace page or include the store reference.");
      return { success: false, error: 'Store not found', matched: 0, unmatched: 0 };
    }

    // 4. Fuzzy-match products
    const matchResults = await fuzzyMatchProducts(supabase, entityId, parsedItems);
    const matchedItems = matchResults.filter(r => r.matched);
    const unmatchedItems = matchResults.filter(r => !r.matched);

    // 5. Build order
    const year = new Date().getFullYear();
    const serial = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
    const orderNo = `WA-${year}-${serial}`;

    // Calculate totals from matched items (unmatched items have price = 0)
    const orderItems = matchResults.map(r => {
      const unitPrice = r.mrp || 0;
      const taxable = unitPrice;
      const gst5 = parseFloat((taxable * 0.05 * r.quantity).toFixed(2));
      const total = parseFloat(((taxable * 1.05) * r.quantity).toFixed(2));

      return {
        product_id: r.productId,
        name: r.productName,
        raw_request_text: r.rawName !== r.productName ? r.rawName : null,
        quantity: r.quantity,
        unit_price: unitPrice,
        discount: 0,
        gst_5: gst5,
        total,
        matched: r.matched,
        match_confidence: r.confidence || null,
        status: 'ACTIVE',
      };
    });

    const subtotal = orderItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const gstTotal = orderItems.reduce((s, i) => s + i.gst_5, 0);
    const grandTotal = orderItems.reduce((s, i) => s + i.total, 0);

    // 6. Create DRAFT order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_type: 'POS_SALE',
        order_no: orderNo,
        status: 'DRAFT',
        order_source: 'WHATSAPP',
        seller_id: entityId,
        buyer_phone: phone,
        whatsapp_message_id: messageId,
        items: orderItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        gst_total: parseFloat(gstTotal.toFixed(2)),
        grand_total: parseFloat(grandTotal.toFixed(2)),
        payment_method: 'CASH', // default, staff adjusts
      })
      .select('id, order_no')
      .single();

    if (orderError || !order) {
      console.error('Failed to create DRAFT order:', orderError);
      await sendReply(phone, "Sorry, we're experiencing technical issues. Please try again in a few minutes.");
      return { success: false, error: 'Order creation failed', matched: matchedItems.length, unmatched: unmatchedItems.length };
    }

    // Insert order items
    const orderItemsWithOrderId = orderItems.map(i => ({
      ...i,
      order_id: order.id,
    }));

    await supabase.from('order_items').insert(orderItemsWithOrderId);

    // 7. Ensure consumer account
    await supabase
      .from('consumer_accounts')
      .upsert({ phone, last_order_at: new Date().toISOString() }, { onConflict: 'phone' });

    // 8. Reply to customer
    const itemSummary = matchResults.map(r =>
      `- ${r.productName} × ${r.quantity} ${r.matched ? '✓' : '❌ (not found)'}`
    ).join('\n');

    await sendReply(
      phone,
      `Order received! ${entityName} will confirm shortly.\n\nYour items:\n${itemSummary}\n\nWe'll message you once confirmed.`
    );

    return {
      success: true,
      orderId: order.id,
      orderNo: order.order_no,
      matched: matchedItems.length,
      unmatched: unmatchedItems.length,
    };
  } catch (err) {
    console.error('Order handler error:', err);
    return { success: false, error: 'Internal error', matched: 0, unmatched: 0 };
  }
}
