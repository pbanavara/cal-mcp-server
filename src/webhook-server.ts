import express from 'express';
import cors from 'cors';
import { GmailWebhookPayload } from './types';

const app = express();
const PORT = process.env['WEBHOOK_PORT'] || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Store the callback function to notify the main server
let notifyCallback: ((messageId: string) => void) | null = null;

export function setNotifyCallback(callback: (messageId: string) => void) {
  notifyCallback = callback;
}

// Webhook endpoint for Gmail notifications
app.post('/webhook/gmail', (req, res) => {
  try {
    const payload: GmailWebhookPayload = req.body;
    
    console.log('📨 Received Gmail webhook:', payload.message.messageId);
    
    // Extract message ID from the webhook payload
    const messageId = payload.message.messageId;
    
    // Notify the main server about the new message
    if (notifyCallback) {
      notifyCallback(messageId);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'gmail-webhook'
  });
});

// Start the webhook server
export function startWebhookServer(): void {
  app.listen(PORT, () => {
    console.log(`🌐 Webhook server running on port ${PORT}`);
    console.log(`📨 Gmail webhook endpoint: http://localhost:${PORT}/webhook/gmail`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
  });
}

// For standalone webhook server
if (require.main === module) {
  startWebhookServer();
} 