# Server-Sent Events (SSE) for Real-Time Email Notifications

This implementation provides real-time email notifications using Server-Sent Events (SSE) when the MCP server is polling for new emails.

## 🚀 Features

- **Real-time Notifications**: Instant push notifications when new emails are detected
- **Multiple Client Support**: Multiple clients can connect simultaneously
- **Automatic Reconnection**: Client library handles connection failures with exponential backoff
- **User-Specific Notifications**: Can target notifications to specific users
- **Easy Integration**: Simple JavaScript client library for web applications

## 📁 Files

- `mcp-server/src/mcp-server-remote.ts` - SSE server implementation
- `mcp-server/sse-client.js` - Reusable client library
- `mcp-server/sse-test.html` - Test page for SSE functionality
- `mcp-server/sse-usage-example.html` - Usage example and documentation

## 🔧 How It Works

### Server Side (MCP Server)

1. **SSE Manager**: Manages connected clients and broadcasts notifications
2. **Email Detection**: When `GmailMonitor` detects new emails during polling, it calls `onNewGmailMessage`
3. **Notification Broadcasting**: Extracts email details and broadcasts to all connected SSE clients
4. **Client Management**: Handles client connections, disconnections, and cleanup

### Client Side

1. **Connection**: Client connects to `/sse` endpoint
2. **Event Listening**: Listens for `new_email` events
3. **Reconnection**: Automatically reconnects on connection failures
4. **Event Handling**: Processes email notifications in real-time

## 🛠️ Usage

### Basic Usage

```javascript
// Include the SSE client library
<script src="sse-client.js"></script>

// Create and configure the client
const emailClient = new EmailSSEClient('http://localhost:3001');

// Listen for new emails
emailClient.on('new_email', (emailData) => {
    console.log('New email received:', emailData);
    // Handle the new email notification
    showNotification(emailData.subject, emailData.from);
});

// Listen for connection events
emailClient.on('connected', () => {
    console.log('Connected to email notifications');
});

emailClient.on('disconnected', () => {
    console.log('Disconnected from email notifications');
});

// Connect to the server
emailClient.connect();
```

### Advanced Usage

```javascript
const emailClient = new EmailSSEClient('http://localhost:3001');

// Custom server URL
const emailClient = new EmailSSEClient('https://your-server.com');

// Check connection status
const status = emailClient.getStatus();
console.log('Connection status:', status);

// Check server status
const serverStatus = await emailClient.checkServerStatus();
console.log('Server status:', serverStatus);

// Disconnect
emailClient.disconnect();
```

## 📡 API Endpoints

### SSE Endpoint
- **URL**: `GET /sse`
- **Description**: Server-Sent Events endpoint for real-time notifications
- **Headers**: 
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`

### Status Endpoint
- **URL**: `GET /sse/status`
- **Description**: Get current SSE connection status
- **Response**: 
  ```json
  {
    "connectedClients": 2,
    "timestamp": "2025-07-16T20:30:00.000Z"
  }
  ```

## 📨 Event Types

### `connected`
Emitted when client successfully connects to SSE.

```javascript
{
  "event": "connected",
  "clientId": "uuid-123",
  "timestamp": "2025-07-16T20:30:00.000Z"
}
```

### `new_email`
Emitted when a new email is detected during polling.

```javascript
{
  "event": "new_email",
  "data": {
    "messageId": "198146c5622f75a1",
    "subject": "Meeting Tomorrow",
    "from": "colleague@company.com",
    "snippet": "Hi, let's meet tomorrow at 2pm...",
    "receivedAt": "2025-07-16T20:30:00.000Z"
  },
  "timestamp": "2025-07-16T20:30:00.000Z"
}
```

### `disconnected`
Emitted when client disconnects from SSE.

### `error`
Emitted when connection errors occur.

## 🔄 Polling Integration

The SSE system integrates with the Gmail polling system:

1. **Start Polling**: Use the `start_watching_for_new_emails` MCP tool
2. **Email Detection**: `GmailMonitor` polls for unread messages every 60 seconds
3. **Notification**: When new emails are found, `onNewGmailMessage` is called
4. **SSE Broadcast**: Email details are broadcast to all connected SSE clients

## 🧪 Testing

### Test Page
Open `sse-test.html` in your browser to test the SSE functionality:

```bash
# Start the MCP server
cd mcp-server
npm run dev

# Open the test page
open sse-test.html
```

### Manual Testing
1. Start the MCP server
2. Connect to SSE using the test page
3. Use the `start_watching_for_new_emails` tool
4. Send yourself an email
5. Watch for real-time notifications

## 🔧 Configuration

### Server Configuration
The SSE server runs on the same port as the MCP server (default: 3001).

### Client Configuration
```javascript
const emailClient = new EmailSSEClient('http://localhost:3001', {
    maxReconnectAttempts: 5,
    reconnectDelay: 1000
});
```

## 🚨 Error Handling

### Server Errors
- Connection errors are logged and clients are removed
- Invalid clients are automatically cleaned up

### Client Errors
- Automatic reconnection with exponential backoff
- Maximum reconnection attempts (default: 5)
- Error events are emitted for handling

## 🔒 Security Considerations

- **CORS**: SSE endpoint allows all origins (`*`) for development
- **Authentication**: Consider adding JWT authentication to SSE endpoint for production
- **Rate Limiting**: Consider implementing rate limiting for SSE connections

## 🚀 Production Deployment

### Security Enhancements
```javascript
// Add authentication to SSE endpoint
app.get('/sse', jwtAuthMiddleware.authenticateJWT, (req, res) => {
    // SSE implementation with user context
    sseManager.addClient(clientId, res, req.user?.email);
});
```

### Load Balancing
- Use sticky sessions for SSE connections
- Consider Redis for client management across multiple server instances

### Monitoring
- Monitor SSE connection count
- Track notification delivery rates
- Log connection errors and reconnection attempts

## 📊 Performance

### Server Performance
- Lightweight SSE implementation
- Efficient client management
- Automatic cleanup of disconnected clients

### Client Performance
- Minimal memory footprint
- Efficient reconnection logic
- Event-driven architecture

## 🔗 Integration Examples

### Web Application
```javascript
// In your React/Vue/Angular app
const emailClient = new EmailSSEClient();

emailClient.on('new_email', (email) => {
    // Update UI with new email notification
    this.addNotification(email);
});
```

### Desktop Application
```javascript
// In Electron or similar
const emailClient = new EmailSSEClient();

emailClient.on('new_email', (email) => {
    // Show desktop notification
    new Notification(email.subject, {
        body: email.snippet,
        icon: 'path/to/icon.png'
    });
});
```

### Mobile Application
```javascript
// In React Native or similar
const emailClient = new EmailSSEClient();

emailClient.on('new_email', (email) => {
    // Show push notification
    PushNotification.localNotification({
        title: email.subject,
        message: email.snippet
    });
});
```

## 🎯 Next Steps

1. **Add Authentication**: Implement JWT authentication for SSE endpoint
2. **User-Specific Notifications**: Enhance to send notifications only to relevant users
3. **Message Filtering**: Add filtering options for specific email types
4. **WebSocket Alternative**: Consider WebSocket implementation for bi-directional communication
5. **Mobile Push Notifications**: Integrate with push notification services

---

**The SSE implementation provides a robust, scalable solution for real-time email notifications that can be easily integrated into any web application!** 