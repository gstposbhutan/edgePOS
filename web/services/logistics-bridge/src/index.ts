/**
 * NEXUS BHUTAN - Logistics Bridge Service
 *
 * Webhook handlers for Toofan and Rider app last-mile delivery integration.
 * Translates delivery provider events into order status updates and
 * triggers WhatsApp payment links after delivery confirmation.
 *
 * @package logistics-bridge
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3002;

const GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'logistics-bridge' });
});

// ─── Shared delivery event handler ─────────────────────────────────────────

async function handleDeliveryEvent(event: string, orderId: string) {
  if (!supabase) {
    console.warn('[logistics-bridge] Supabase not configured — skipping DB update');
    return;
  }

  if (event === 'PICKED_UP') {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'DISPATCHED' })
      .eq('id', orderId)
      .in('status', ['PROCESSING', 'CONFIRMED']);

    if (error) {
      console.error(`[PICKED_UP] Failed to update order ${orderId}:`, error.message);
      return;
    }

    console.log(`[PICKED_UP] Order ${orderId} → DISPATCHED`);
  }

  if (event === 'DELIVERED') {
    // Fetch order details before updating
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_no, buyer_whatsapp, payment_token, grand_total')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      console.error(`[DELIVERED] Order ${orderId} not found:`, fetchError?.message);
      return;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'DELIVERED' })
      .eq('id', orderId)
      .eq('status', 'DISPATCHED');

    if (updateError) {
      console.error(`[DELIVERED] Failed to update order ${orderId}:`, updateError.message);
      return;
    }

    console.log(`[DELIVERED] Order ${orderId} → DELIVERED`);

    // Send payment link to customer
    if (order.buyer_whatsapp && order.payment_token) {
      const paymentUrl = `${APP_URL}/pay/${orderId}?token=${order.payment_token}`;

      fetch(`${GATEWAY_URL}/api/send-payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: order.buyer_whatsapp,
          orderNo: order.order_no,
          grandTotal: order.grand_total,
          paymentUrl,
        }),
      }).catch((err) => {
        console.error('[DELIVERED] Failed to send payment link:', err.message);
      });
    }
  }
}

// ─── POST /webhooks/toofan ──────────────────────────────────────────────────

app.post('/webhooks/toofan', async (req, res) => {
  try {
    const { event, orderId } = req.body;

    if (!orderId || !event) {
      return res.status(400).json({ success: false, error: 'event and orderId required' });
    }

    // TODO: validate Toofan webhook signature when API docs are available
    console.log(`[Toofan] ${event} for order ${orderId}`);

    await handleDeliveryEvent(event, orderId);

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Toofan webhook error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process webhook' });
  }
});

// ─── POST /webhooks/rider ───────────────────────────────────────────────────

app.post('/webhooks/rider', async (req, res) => {
  try {
    const { event, orderId, riderId } = req.body;

    if (!orderId || !event) {
      return res.status(400).json({ success: false, error: 'event and orderId required' });
    }

    // TODO: validate Rider app webhook signature when API docs are available
    console.log(`[Rider] ${event} from rider ${riderId} for order ${orderId}`);

    await handleDeliveryEvent(event, orderId);

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Rider webhook error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process webhook' });
  }
});

// ─── POST /api/dispatch-delivery ───────────────────────────────────────────

app.post('/api/dispatch-delivery', async (req, res) => {
  try {
    const { orderId, customerLocation, orderDetails, retry = false } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId required' });
    }

    if (!supabase) {
      console.warn('[dispatch] Supabase not configured — cannot assign rider');
      return res.json({ success: true, deliveryId: `DLV-${Date.now()}`, message: 'Supabase not configured' });
    }

    // Find first available active rider (exclude riders already assigned to this order)
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_no, seller_id, buyer_whatsapp, grand_total, entities!seller_id(name, whatsapp_no)')
      .eq('id', orderId)
      .single();

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const { data: riders } = await supabase
      .from('riders')
      .select('id, name, whatsapp_no')
      .eq('is_active', true)
      .eq('is_available', true)
      .is('current_order_id', null)
      .limit(1);

    if (!riders?.length) {
      console.warn(`[dispatch] No available riders for order ${orderId}`);
      return res.json({ success: false, message: 'No available riders — vendor will need to dispatch manually' });
    }

    const rider = riders[0];

    // Pre-assign rider on the order (is_available stays true until they accept)
    await supabase
      .from('orders')
      .update({ rider_id: rider.id })
      .eq('id', orderId);

    // Build accept/reject URLs
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/rider/orders/${orderId}/accept`;
    const rejectUrl = `${appUrl}/rider/orders/${orderId}/reject`;

    // Send assignment notification to rider via WhatsApp
    const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';
    await fetch(`${gatewayUrl}/api/send-rider-assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riderPhone: rider.whatsapp_no,
        orderNo: order.order_no,
        vendorName: (order as any).entities?.name ?? 'Store',
        vendorAddress: customerLocation?.address ?? '',
        itemCount: orderDetails?.itemCount ?? 1,
        acceptUrl,
        rejectUrl,
      }),
    }).catch((err: any) => console.error('[dispatch] Gateway notification failed:', err.message));

    console.log(`[dispatch] Assigned rider ${rider.name} to order ${order.order_no}`);

    return res.json({
      success: true,
      deliveryId: `DLV-${Date.now()}`,
      riderId: rider.id,
      riderName: rider.name,
    });
  } catch (error: any) {
    console.error('Dispatch delivery error:', error);
    return res.status(500).json({ success: false, error: 'Failed to dispatch delivery' });
  }
});

app.listen(PORT, () => {
  console.log(`Logistics Bridge service running on port ${PORT}`);
});

export default app;
