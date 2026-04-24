/**
 * NEXUS BHUTAN - WhatsApp Gateway Service
 *
 * Meta Cloud API integration for OTP delivery, PDF receipts, and notifications.
 *
 * Environment variables required:
 *   WHATSAPP_TOKEN       — Meta Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID — Business phone number ID from Meta
 *   PORT                 — Service port (default: 3001)
 *
 * @package whatsapp-gateway
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_API = 'https://graph.facebook.com/v21.0';

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'whatsapp-gateway' });
});

/**
 * Send WhatsApp OTP message.
 * Uses the authentication OTP template if approved, falls back to text.
 */
app.post('/api/send-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'phone and otp required' });
    }

    // Remove leading + for Meta API (uses country code directly)
    const formattedPhone = phone.replace(/^\+/, '');

    if (WA_TOKEN && WA_PHONE_ID) {
      // Attempt template-based OTP send
      const response = await fetch(`${WA_API}/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: 'auth_otp',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: otp },
                ],
              },
            ],
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Template not approved — fall back to text message
        console.warn('Template send failed, falling back to text:', data);
        await sendTextMessage(formattedPhone, `Your NEXUS BHUTAN verification code is: ${otp}\n\nValid for 5 minutes. Do not share this code.`);
      }

      return res.json({ success: true });
    }

    // No credentials — log for development
    console.log(`[DEV] WhatsApp OTP for +${formattedPhone}: ${otp}`);
    return res.json({ success: true, dev: true });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
});

/**
 * Send a plain text WhatsApp message.
 */
async function sendTextMessage(phone: string, text: string) {
  if (!WA_TOKEN || !WA_PHONE_ID) return;

  await fetch(`${WA_API}/${WA_PHONE_ID}/messages`, {
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
}

// Send PDF receipt endpoint
app.post('/api/send-receipt', async (req, res) => {
  try {
    const { phoneNumber, invoiceId, pdfUrl } = req.body;

    // TODO: Implement WhatsApp Business API receipt delivery
    res.json({
      success: true,
      message: 'Receipt will be sent via WhatsApp',
      phoneNumber,
      invoiceId,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send WhatsApp message',
    });
  }
});

// Send stock alert endpoint
app.post('/api/send-stock-alert', async (req, res) => {
  try {
    const { retailerPhone, productName, currentStock } = req.body;

    // TODO: Implement WhatsApp alert for low stock
    res.json({
      success: true,
      message: 'Stock alert will be sent via WhatsApp',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send stock alert',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp Gateway service running on port ${PORT}`);
});

export default app;
