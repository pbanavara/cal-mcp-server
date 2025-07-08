# MCP Email Monitor Server

A Model Context Protocol (MCP) server that monitors Gmail for new emails and sends real-time notifications to connected clients (like Cursor IDE).

## 🚀 Features

- **Gmail API Integration**: Monitors Gmail inbox for new messages
- **MCP Protocol**: Implements the Model Context Protocol for client communication
- **Real-time Notifications**: Sends instant notifications when new emails arrive
- **Token Management**: Reads OAuth tokens from the web app
- **Webhook Support**: Handles Gmail push notifications
- **Graceful Shutdown**: Proper cleanup on server termination

## 📁 Project Structure

```
mcp-server/
├── src/
│   ├── types.ts              # TypeScript type definitions
│   ├── token-manager.ts      # OAuth token management
│   ├── gmail-monitor.ts      # Gmail API monitoring
│   ├── mcp-server.ts         # MCP protocol implementation
│   ├── server.ts             # Main server entry point
│   └── webhook-server.ts     # Gmail webhook handler
├── dist/                     # Compiled JavaScript
├── package.json              # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## 🛠️ Prerequisites

- Node.js 18+
- npm or yarn
- Google Cloud Console project with Gmail API enabled
- OAuth tokens from the web app

## 📦 Installation

1. **Navigate to the MCP server directory**:
   ```bash
   cd mcp-server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `mcp-server` directory:

```env
# Webhook server port (for Gmail notifications)
WEBHOOK_PORT=3002

# Google Cloud project settings
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GMAIL_WATCH_TOPIC=projects/your-project-id/topics/gmail-notifications
```

### Google Cloud Setup

The Gmail watch API requires a Google Cloud Pub/Sub topic and subscription:

1. **Create a Pub/Sub topic**:
   ```bash
   gcloud pubsub topics create gmail-notifications
   ```

2. **Create a subscription**:
   ```bash
   gcloud pubsub subscriptions create gmail-webhook \
     --topic=gmail-notifications \
     --push-endpoint=http://your-domain.com/webhook/gmail
   ```

3. **Update the topic name** in `gmail-monitor.ts`:
   ```typescript
   topicName: 'projects/your-project-id/topics/gmail-notifications'
   ```

## 🚀 Usage

### Starting the MCP Server

1. **Ensure you have tokens** from the web app:
   ```bash
   # Check if tokens exist
   ls ../mcp_tokens.json
   ```

2. **Start the MCP server**:
   ```bash
   npm start
   ```

3. **For development**:
   ```bash
   npm run dev
   ```

### Starting the Webhook Server

The webhook server handles Gmail push notifications:

```bash
npm run webhook
```

### Available Scripts

```bash
npm run build        # Build TypeScript to JavaScript
npm run start        # Start the MCP server
npm run dev          # Start in development mode
npm run watch        # Watch for changes and rebuild
npm run clean        # Clean build artifacts
npm run webhook      # Start webhook server
```

## 🔌 MCP Protocol

The server implements the MCP protocol with the following capabilities:

### Notifications

- **Subscribe**: Clients can subscribe to email notifications
- **Unsubscribe**: Clients can unsubscribe from notifications
- **Notify**: Server sends notifications when new emails arrive

### Notification Format

```json
{
  "type": "email_received",
  "data": {
    "messageId": "gmail-message-id",
    "subject": "Email Subject",
    "sender": "sender@example.com",
    "receivedAt": "2024-01-01T12:00:00.000Z",
    "snippet": "Email snippet..."
  }
}
```

## 📧 Gmail Monitoring

### How It Works

1. **Initialization**: Server reads OAuth tokens from web app storage
2. **Watch Setup**: Starts Gmail watch API with Pub/Sub topic
3. **Message Detection**: Monitors for new messages via webhook or polling
4. **Notification**: Sends MCP notifications to connected clients

### Monitoring Methods

1. **Webhook (Recommended)**: Real-time push notifications via Pub/Sub
2. **Polling (Fallback)**: Periodic checks every 30 seconds

## 🔐 Authentication

The server reads OAuth tokens from the web app's storage:

- **Token Location**: `../mcp_tokens.json` (relative to web app)
- **Token Format**: Google OAuth 2.0 tokens with refresh capability
- **Auto-refresh**: Handled by the Google APIs library

## 🐛 Troubleshooting

### Common Issues

1. **"No tokens available"**
   - Ensure you've authenticated in the web app first
   - Check that `mcp_tokens.json` exists in the parent directory

2. **"Token is expired"**
   - Re-authenticate in the web app
   - The server will automatically use refreshed tokens

3. **"Failed to start Gmail watch"**
   - Check Google Cloud Pub/Sub setup
   - Verify topic name and permissions
   - Ensure webhook endpoint is publicly accessible

4. **"Webhook not receiving notifications"**
   - Check webhook server is running
   - Verify Pub/Sub subscription configuration
   - Test webhook endpoint accessibility

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm run dev
```

## 🔄 Integration with Web App

The MCP server integrates with the web app:

1. **Token Sharing**: Reads OAuth tokens from web app storage
2. **Launch Integration**: Web app can launch the MCP server
3. **Status Monitoring**: Web app can check MCP server status

## 📝 API Reference

### Server Status

```typescript
interface ServerStatus {
  isRunning: boolean;
  clientCount: number;
  gmailStatus: {
    isWatching: boolean;
    currentHistoryId: string | null;
    watchExpiration: string | null;
  };
}
```

### Gmail Monitor Status

```typescript
interface GmailStatus {
  isWatching: boolean;
  currentHistoryId: string | null;
  watchExpiration: string | null;
}
```

## 🚀 Deployment

### Local Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker (Future)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["npm", "start"]
```

## 🔮 Future Enhancements

- **Meeting Detection**: AI-powered meeting email detection
- **Email Filtering**: Configurable email filters
- **Multiple Accounts**: Support for multiple Gmail accounts
- **Analytics**: Email monitoring statistics
- **Web Dashboard**: Real-time monitoring dashboard

## 📄 License

This project is licensed under the MIT License.

---

**Built for seamless email monitoring and real-time notifications in development environments** 