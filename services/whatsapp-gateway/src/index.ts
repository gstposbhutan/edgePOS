/**
 * NEXUS BHUTAN - WhatsApp Gateway Service
 *
 * This microservice handles Meta Cloud API integration for
 * PDF receipt delivery and supply chain notifications.
 *
 * @package whatsapp-gateway
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'whatsapp-gateway' });
});

// Send PDF receipt endpoint
app.post('/api/send-receipt', async (req, res) => {
  try {
    const { phoneNumber, invoiceId, pdfUrl } = req.body;

    // TODO: Implement WhatsApp Business API integration
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
