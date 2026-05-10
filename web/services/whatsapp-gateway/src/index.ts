/**
 * NEXUS BHUTAN — WhatsApp Gateway Service
 *
 * Meta Cloud API integration for OTP delivery, PDF receipts, stock alerts,
 * and credit/khata notifications.
 *
 * Environment variables:
 *   WHATSAPP_TOKEN           — Meta Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID — Business phone number ID from Meta
 *   WHATSAPP_VERIFY_TOKEN    — Token for webhook verification
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_KEY     — Supabase service role key
 *   PORT                     — Service port (default: 3001)
 *
 * @package whatsapp-gateway
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { handleIncomingOrder } from './order-handler';

const app = express();
const PORT = process.env.PORT || 3001;

const WA_TOKEN    = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_VERIFY   = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WA_API      = 'https://graph.facebook.com/v21.0';

// Supabase client for updating whatsapp_status on orders and alerts
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'whatsapp-gateway' });
});

// ─── Core: send WhatsApp text message ──────────────────────────────────────

async function sendTextMessage(phone: string, text: string) {
  if (!WA_TOKEN || !WA_PHONE_ID) return null;

  const response = await fetch(`${WA_API}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    }),
  });

  return response.json();
}

// ─── Core: send WhatsApp template message ──────────────────────────────────

async function sendTemplateMessage(phone: string, templateName: string, components: any[]) {
  if (!WA_TOKEN || !WA_PHONE_ID) return null;

  const response = await fetch(`${WA_API}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components,
      },
    }),
  });

  return response.json();
}

// ─── POST /api/send-otp ────────────────────────────────────────────────────

app.post('/api/send-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'phone and otp required' });
    }

    const formattedPhone = phone.replace(/^\+/, '');

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(formattedPhone, 'auth_otp', [
        {
          type: 'body',
          parameters: [{ type: 'text', text: otp }],
        },
      ]);

      if (data?.error) {
        console.warn('Template send failed, falling back to text:', data.error);
        await sendTextMessage(
          formattedPhone,
          `Your NEXUS BHUTAN verification code is: ${otp}\n\nValid for 5 minutes. Do not share this code.`
        );
      }

      return res.json({ success: true });
    }

    console.log(`[DEV] WhatsApp OTP for +${formattedPhone}: ${otp}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
});

// ─── POST /api/send-receipt ────────────────────────────────────────────────
// Sends a receipt summary via WhatsApp text message.
// For PDF delivery, the caller should generate the PDF and pass a public URL.

app.post('/api/send-receipt', async (req, res) => {
  try {
    const { phoneNumber, invoiceId, orderNo, entityName, grandTotal, gstTotal, buyerWhatsapp, pdfUrl } = req.body;

    if (!phoneNumber && !buyerWhatsapp) {
      return res.status(400).json({ success: false, error: 'phoneNumber or buyerWhatsapp required' });
    }

    const phone = (phoneNumber ?? buyerWhatsapp).replace(/^\+/, '');
    const storeName = entityName || 'NEXUS BHUTAN';

    if (WA_TOKEN && WA_PHONE_ID) {
      // Try template first, fall back to text
      const summary =
        `Receipt from *${storeName}*\n` +
        `Invoice: ${orderNo || invoiceId}\n` +
        `Total: Nu. ${parseFloat(grandTotal || 0).toFixed(2)}\n` +
        `GST (5%): Nu. ${parseFloat(gstTotal || 0).toFixed(2)}\n\n` +
        (pdfUrl ? `View PDF: ${pdfUrl}\n\n` : '') +
        `Thank you for your purchase!`;

      const data = await sendTemplateMessage(phone, 'receipt_notification', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: storeName },
            { type: 'text', text: orderNo || invoiceId },
            { type: 'text', text: `Nu. ${parseFloat(grandTotal || 0).toFixed(2)}` },
          ],
        },
      ]);

      if (data?.error) {
        console.warn('Receipt template failed, falling back to text:', data.error);
        await sendTextMessage(phone, summary);
      }

      // Update order whatsapp_status
      if (supabase && invoiceId) {
        await supabase
          .from('orders')
          .update({ whatsapp_status: 'SENT' })
          .eq('id', invoiceId);
      }

      return res.json({ success: true });
    }

    console.log(`[DEV] WhatsApp receipt for +${phone}: Invoice ${orderNo || invoiceId}, Total Nu. ${grandTotal}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send receipt error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send receipt' });
  }
});

// ─── POST /api/send-stock-alert ────────────────────────────────────────────

app.post('/api/send-stock-alert', async (req, res) => {
  try {
    const { retailerPhone, productName, currentStock, entityName, reorderLevel } = req.body;

    if (!retailerPhone) {
      return res.status(400).json({ success: false, error: 'retailerPhone required' });
    }

    const phone = retailerPhone.replace(/^\+/, '');
    const store = entityName || 'NEXUS BHUTAN';

    if (WA_TOKEN && WA_PHONE_ID) {
      const message =
        `⚠️ *Low Stock Alert* — ${store}\n\n` +
        `Product: ${productName}\n` +
        `Current Stock: ${currentStock}\n` +
        (reorderLevel ? `Reorder Level: ${reorderLevel}\n` : '') +
        `\nRestock soon to avoid stockouts.`;

      const data = await sendTemplateMessage(phone, 'stock_alert', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: productName },
            { type: 'text', text: String(currentStock) },
          ],
        },
      ]);

      if (data?.error) {
        console.warn('Stock alert template failed, falling back to text:', data.error);
        await sendTextMessage(phone, message);
      }

      return res.json({ success: true });
    }

    console.log(`[DEV] Stock alert for +${phone}: ${productName} = ${currentStock} units`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send stock alert error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send stock alert' });
  }
});

// ─── POST /api/send-credit-alert ───────────────────────────────────────────
// Sends khata/credit reminders (due soon, overdue, etc.)

app.post('/api/send-credit-alert', async (req, res) => {
  try {
    const { debtorPhone, debtorName, outstandingBalance, alertType, entityName, dueDate } = req.body;

    if (!debtorPhone) {
      return res.status(400).json({ success: false, error: 'debtorPhone required' });
    }

    const phone = debtorPhone.replace(/^\+/, '');
    const store = entityName || 'NEXUS BHUTAN';
    const name  = debtorName || phone;

    const messages: Record<string, string> = {
      PRE_DUE_3D:    `Hi ${name}, your credit payment of *Nu. ${parseFloat(outstandingBalance).toFixed(2)}* at ${store} is due in 3 days (${dueDate}).`,
      DUE_TODAY:     `Hi ${name}, your credit payment of *Nu. ${parseFloat(outstandingBalance).toFixed(2)}* at ${store} is due *today*. Please settle soon.`,
      OVERDUE_3D:    `Hi ${name}, your credit payment of *Nu. ${parseFloat(outstandingBalance).toFixed(2)}* at ${store} was due 3 days ago. Please settle promptly.`,
      OVERDUE_30D:   `⚠️ ${name} has an overdue balance of *Nu. ${parseFloat(outstandingBalance).toFixed(2)}* at ${store} — 30+ days past due.`,
      MONTHLY_REMINDER: `Hi ${name}, your outstanding khata balance at ${store} is *Nu. ${parseFloat(outstandingBalance).toFixed(2)}*. Please visit to settle.`,
    };

    const text = messages[alertType] || messages.MONTHLY_REMINDER;

    if (WA_TOKEN && WA_PHONE_ID) {
      await sendTextMessage(phone, text);
      return res.json({ success: true });
    }

    console.log(`[DEV] Credit alert for +${phone}: ${alertType} — Nu. ${outstandingBalance}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send credit alert error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send credit alert' });
  }
});

// ─── POST /api/send-order-confirmation ────────────────────────────────────
// Sent to the customer after they place a marketplace order (all vendor orders listed)

app.post('/api/send-order-confirmation', async (req, res) => {
  try {
    const { phoneNumber, orders, totalAmount } = req.body;

    if (!phoneNumber || !orders?.length) {
      return res.status(400).json({ success: false, error: 'phoneNumber and orders required' });
    }

    const phone = phoneNumber.replace(/^\+/, '');
    const orderLines = orders
      .map((o: any) => `• ${o.seller_name} — ${o.order_no} — Nu. ${parseFloat(o.grand_total).toFixed(2)}`)
      .join('\n');

    const message =
      `✅ *Your order is confirmed!*\n\n` +
      `${orderLines}\n\n` +
      `*Total: Nu. ${parseFloat(totalAmount || 0).toFixed(2)}*\n\n` +
      `Your goods will be delivered to your address. You'll receive a payment link after delivery.`;

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(phone, 'order_confirmation', [
        { type: 'body', parameters: [{ type: 'text', text: orderLines }, { type: 'text', text: `Nu. ${parseFloat(totalAmount || 0).toFixed(2)}` }] },
      ]);
      if (data?.error) {
        console.warn('order_confirmation template failed, falling back to text:', data.error);
        await sendTextMessage(phone, message);
      }
      return res.json({ success: true });
    }

    console.log(`[DEV] Order confirmation for +${phone}:\n${message}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send order confirmation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send order confirmation' });
  }
});

// ─── POST /api/send-order-notification ─────────────────────────────────────
// Sent to a vendor when a new marketplace order arrives for their store

app.post('/api/send-order-notification', async (req, res) => {
  try {
    const { vendorPhone, orderNo, grandTotal, itemCount, customerPhone } = req.body;

    if (!vendorPhone || !orderNo) {
      return res.status(400).json({ success: false, error: 'vendorPhone and orderNo required' });
    }

    const phone = vendorPhone.replace(/^\+/, '');

    const message =
      `🛍️ *New marketplace order!*\n\n` +
      `Order: ${orderNo}\n` +
      `Amount: Nu. ${parseFloat(grandTotal || 0).toFixed(2)}\n` +
      `Items: ${itemCount}\n` +
      `Customer: ${customerPhone}\n\n` +
      `Log in to your POS to process this order.`;

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(phone, 'order_notification', [
        { type: 'body', parameters: [
          { type: 'text', text: orderNo },
          { type: 'text', text: `Nu. ${parseFloat(grandTotal || 0).toFixed(2)}` },
          { type: 'text', text: String(itemCount) },
        ]},
      ]);
      if (data?.error) {
        console.warn('order_notification template failed, falling back to text:', data.error);
        await sendTextMessage(phone, message);
      }
      return res.json({ success: true });
    }

    console.log(`[DEV] Order notification for vendor +${phone}:\n${message}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send order notification error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send order notification' });
  }
});

// ─── POST /api/send-payment-link ────────────────────────────────────────────
// Sent to the customer after their order is marked DELIVERED — contains the payment URL

app.post('/api/send-payment-link', async (req, res) => {
  try {
    const { phoneNumber, orderNo, grandTotal, paymentUrl } = req.body;

    if (!phoneNumber || !paymentUrl) {
      return res.status(400).json({ success: false, error: 'phoneNumber and paymentUrl required' });
    }

    const phone = phoneNumber.replace(/^\+/, '');

    const message =
      `📦 *Your order has been delivered!*\n\n` +
      `Order: ${orderNo}\n` +
      `Amount due: *Nu. ${parseFloat(grandTotal || 0).toFixed(2)}*\n\n` +
      `Tap the link below to upload your payment screenshot:\n${paymentUrl}\n\n` +
      `This link expires in 7 days.`;

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(phone, 'payment_link', [
        { type: 'body', parameters: [
          { type: 'text', text: orderNo },
          { type: 'text', text: `Nu. ${parseFloat(grandTotal || 0).toFixed(2)}` },
          { type: 'text', text: paymentUrl },
        ]},
      ]);
      if (data?.error) {
        console.warn('payment_link template failed, falling back to text:', data.error);
        await sendTextMessage(phone, message);
      }
      return res.json({ success: true });
    }

    console.log(`[DEV] Payment link for +${phone}:\n${message}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send payment link error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send payment link' });
  }
});

// ─── POST /api/send-rider-assignment ───────────────────────────────────────
// Sent to rider when a new order is assigned for pickup

app.post('/api/send-rider-assignment', async (req, res) => {
  try {
    const { riderPhone, orderNo, vendorName, vendorAddress, itemCount, acceptUrl, rejectUrl } = req.body;

    if (!riderPhone || !orderNo) {
      return res.status(400).json({ success: false, error: 'riderPhone and orderNo required' });
    }

    const phone = riderPhone.replace(/^\+/, '');

    const message =
      `🛵 *New delivery assignment!*\n\n` +
      `Order: ${orderNo}\n` +
      `Pickup from: ${vendorName}\n` +
      `Address: ${vendorAddress || 'Check app for details'}\n` +
      `Items: ${itemCount}\n\n` +
      `Accept: ${acceptUrl}\n` +
      `Reject: ${rejectUrl}`;

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(phone, 'rider_assignment', [
        { type: 'body', parameters: [
          { type: 'text', text: orderNo },
          { type: 'text', text: vendorName },
          { type: 'text', text: acceptUrl },
        ]},
      ]);
      if (data?.error) {
        await sendTextMessage(phone, message);
      }
      return res.json({ success: true });
    }

    console.log(`[DEV] Rider assignment for +${phone}:\n${message}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send rider assignment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send rider assignment' });
  }
});

// ─── POST /api/send-pickup-otp ──────────────────────────────────────────────
// Sent to vendor when rider accepts — contains the pickup OTP

app.post('/api/send-pickup-otp', async (req, res) => {
  try {
    const { vendorPhone, orderNo, riderName, pickupOtp } = req.body;

    if (!vendorPhone || !pickupOtp) {
      return res.status(400).json({ success: false, error: 'vendorPhone and pickupOtp required' });
    }

    const phone = vendorPhone.replace(/^\+/, '');

    const message =
      `✅ *Rider assigned for order ${orderNo}*\n\n` +
      `Rider: ${riderName}\n\n` +
      `*Pickup OTP: ${pickupOtp}*\n` +
      `Share this code with the rider when they arrive to collect the package.\n\n` +
      `This OTP expires in 2 hours.`;

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(phone, 'pickup_otp', [
        { type: 'body', parameters: [
          { type: 'text', text: orderNo },
          { type: 'text', text: riderName },
          { type: 'text', text: pickupOtp },
        ]},
      ]);
      if (data?.error) {
        await sendTextMessage(phone, message);
      }
      return res.json({ success: true });
    }

    console.log(`[DEV] Pickup OTP for vendor +${phone}:\n${message}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send pickup OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send pickup OTP' });
  }
});

// ─── POST /api/send-delivery-otp ────────────────────────────────────────────
// Sent to customer when order is DISPATCHED — contains the delivery OTP

app.post('/api/send-delivery-otp', async (req, res) => {
  try {
    const { customerPhone, orderNo, deliveryOtp, riderName } = req.body;

    if (!customerPhone || !deliveryOtp) {
      return res.status(400).json({ success: false, error: 'customerPhone and deliveryOtp required' });
    }

    const phone = customerPhone.replace(/^\+/, '');

    const message =
      `🚀 *Your order ${orderNo} is on the way!*\n\n` +
      (riderName ? `Rider: ${riderName}\n\n` : '') +
      `*Delivery OTP: ${deliveryOtp}*\n` +
      `Share this code with the rider when they arrive to confirm delivery.\n\n` +
      `This OTP expires in 4 hours.`;

    if (WA_TOKEN && WA_PHONE_ID) {
      const data = await sendTemplateMessage(phone, 'delivery_otp', [
        { type: 'body', parameters: [
          { type: 'text', text: orderNo },
          { type: 'text', text: deliveryOtp },
        ]},
      ]);
      if (data?.error) {
        await sendTextMessage(phone, message);
      }
      return res.json({ success: true });
    }

    console.log(`[DEV] Delivery OTP for customer +${phone}:\n${message}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send delivery OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send delivery OTP' });
  }
});

// ─── GET /api/webhook — Verification ───────────────────────────────────────

app.get('/api/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WA_VERIFY) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// ─── POST /api/webhook — Delivery status + incoming messages ───────────────

app.post('/api/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // Delivery status update
        if (value.statuses) {
          for (const status of value.statuses) {
            const { id: messageId, status: msgStatus, recipient_id: recipientId } = status;

            if (supabase && msgStatus && messageId) {
              // Update order whatsapp_status if we can correlate
              const statusMap: Record<string, string> = {
                sent: 'SENT',
                delivered: 'DELIVERED',
                read: 'READ',
                failed: 'FAILED',
              };

              // Try to update any matching order
              if (statusMap[msgStatus]) {
                await supabase
                  .from('orders')
                  .update({ whatsapp_status: statusMap[msgStatus] })
                  .eq('buyer_whatsapp', `+${recipientId}`)
                  .eq('whatsapp_status', 'SENT')
                  .order('created_at', { ascending: false })
                  .limit(1);
              }
            }

            console.log(`Message ${messageId} → ${msgStatus}`);
          }
        }

        // Incoming message — WhatsApp ordering
        if (value.messages) {
          for (const message of value.messages) {
            const senderPhone = message.from;
            const text = message.text?.body ?? '';
            const msgId = message.id;

            console.log(`Incoming message from ${senderPhone}: ${text}`);

            // Only process text messages with content
            if (!text.trim()) continue;

            // Extract store ref from message (e.g., "Ref: store-slug")
            const refMatch = text.match(/ref:\s*(\S+)/i);
            const storeRef = refMatch ? refMatch[1] : null;

            // Process order asynchronously — don't block the webhook response
            if (supabase) {
              handleIncomingOrder(
                supabase,
                `+${senderPhone}`,
                text,
                msgId,
                storeRef,
                async (phone: string, replyText: string) => {
                  await sendTextMessage(phone.replace(/^\+/, ''), replyText);
                }
              ).then(result => {
                if (result.success) {
                  console.log(`Order ${result.orderNo} created: ${result.matched} matched, ${result.unmatched} unmatched`);
                } else if (result.error) {
                  console.log(`Order failed for ${senderPhone}: ${result.error}`);
                }
              }).catch(err => {
                console.error('Order processing error:', err);
              });
            }
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp Gateway service running on port ${PORT}`);
});

export default app;
