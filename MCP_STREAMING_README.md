# MCP Streaming Implementation

This implementation provides a hybrid MCP server that switches between regular JSON-RPC mode and Server-Sent Events (SSE) streaming mode based on the `start_watching_for_new_emails` tool call.

## 🚀 How It Works

### **Mode 1: Regular JSON-RPC Mode (Default)**
- **Behavior**: Standard JSON-RPC responses
- **Use Case**: Regular tool calls, status checks, one-time operations
- **Response Format**: Single JSON response

### **Mode 2: Streaming Mode (After start_watching_for_new_emails)**
- **Behavior**: SSE streaming with real-time notifications
- **Use Case**: Continuous email monitoring with live updates
- **Response Format**: Server-Sent Events stream

## 🔄 Mode Switching

### **Trigger: start_watching_for_new_emails**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "start_watching_for_new_emails",
    "arguments": {}
  }
}
```

**What happens:**
1. Server detects this specific tool call
2. Switches to streaming mode (`isStreamingMode = true`)
3. Sets SSE headers on the response
4. Starts Gmail polling
5. Sends initial response
6. Keeps connection alive for real-time notifications

### **Exit: stop_watching_for_new_emails**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "stop_watching_for_new_emails",
    "arguments": {}
  }
}
```

**What happens:**
1. Stops Gmail polling
2. Sends final notification
3. Closes streaming connection
4. Returns to regular JSON-RPC mode

## 📡 Streaming Response Format

### **Initial Response**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Started polling for new emails. Switching to streaming mode for real-time notifications."
      }
    ]
  }
}
```

### **Keep-Alive Messages**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/notify",
  "params": {
    "notification": {
      "type": "email_monitoring_active",
      "message": "Email monitoring is active and polling for new messages..."
    }
  }
}
```

### **Email Notifications**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/notify",
  "params": {
    "notification": {
      "type": "new_email",
      "message": "New email: Meeting Tomorrow",
      "data": {
        "messageId": "198146c5622f75a1",
        "subject": "Meeting Tomorrow",
        "from": "colleague@company.com",
        "snippet": "Hi, let's meet tomorrow at 2pm...",
        "receivedAt": "2025-07-16T20:30:00.000Z"
      }
    }
  }
}
```

### **Stop Notification**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/notify",
  "params": {
    "notification": {
      "type": "email_monitoring_stopped",
      "message": "Email monitoring stopped. Returning to regular mode."
    }
  }
}
```

## 🛠️ Implementation Details

### **Server State Management**
```typescript
// Global state to track streaming mode
let isStreamingMode = false;
let streamingRes: any = null;
```

### **Request Detection**
```typescript
const isStartWatching = req.body?.method === 'tools/call' && 
                       req.body?.params?.name === 'start_watching_for_new_emails';
```

### **Mode Switching Logic**
```typescript
if (isStartWatching) {
  // Switch to streaming mode
  isStreamingMode = true;
  streamingRes = res;
  // Set SSE headers and start streaming
} else if (isStreamingMode) {
  // Handle requests in streaming mode
  // Send responses through SSE
} else {
  // Regular JSON-RPC mode
  await transport.handleRequest(req, res, req.body);
}
```

## 🧪 Testing

### **Test Page**
Use `mcp-streaming-test.html` to test the streaming behavior:

1. **Start the MCP server**
2. **Open the test page**
3. **Click "Start Watching Emails"**
4. **Watch the mode switch to streaming**
5. **Send yourself an email to test notifications**
6. **Click "Stop Watching" to exit streaming mode**

### **Manual Testing with curl**

#### **Start Streaming Mode**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "start_watching_for_new_emails",
      "arguments": {}
    }
  }'
```

#### **Test Regular Tool (Before Streaming)**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_sse_status",
      "arguments": {}
    }
  }'
```

## 🔧 Client Integration

### **JavaScript Client**
```javascript
async function startEmailWatching() {
  const response = await fetch('http://localhost:3001/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'start_watching_for_new_emails',
        arguments: {}
      }
    })
  });

  if (response.ok) {
    // Switch to streaming mode
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    function readStream() {
      reader.read().then(({ done, value }) => {
        if (done) return;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6));
            handleStreamData(data);
          }
        });
        
        readStream();
      });
    }
    
    readStream();
  }
}

function handleStreamData(data) {
  if (data.method === 'notifications/notify') {
    const notification = data.params.notification;
    
    if (notification.type === 'new_email') {
      console.log('📧 New email:', notification.data.subject);
      // Handle new email notification
    }
  }
}
```

### **Cursor/Claude Desktop Integration**
```bash
# In Cursor chat
start_watching_for_new_emails
```

This will:
1. Start email polling
2. Switch to streaming mode
3. Send real-time notifications through the MCP connection

## 🔄 Workflow Summary

### **Before start_watching_for_new_emails**
- **Mode**: Regular JSON-RPC
- **Behavior**: Single request/response
- **Tools**: All tools work normally

### **After start_watching_for_new_emails**
- **Mode**: SSE Streaming
- **Behavior**: Continuous connection with real-time updates
- **Tools**: All tools still work, but responses sent through stream

### **After stop_watching_for_new_emails**
- **Mode**: Back to Regular JSON-RPC
- **Behavior**: Single request/response
- **Tools**: All tools work normally

## 🚨 Error Handling

### **Connection Errors**
- Automatic cleanup of streaming state
- Fallback to regular mode
- Error logging and notification

### **Client Disconnect**
- Automatic cleanup of streaming resources
- Stop email polling
- Reset to regular mode

### **Invalid Requests**
- Proper error responses in both modes
- Graceful handling of malformed requests

## 🎯 Benefits

1. **Seamless Mode Switching**: Automatic transition between modes
2. **Real-time Notifications**: Instant email alerts
3. **Backward Compatibility**: Regular tools still work
4. **Resource Management**: Automatic cleanup and resource management
5. **Flexible Integration**: Works with any MCP client

## 🔒 Security Considerations

- **JWT Authentication**: Required for all endpoints
- **Connection Limits**: Consider implementing connection limits
- **Rate Limiting**: Implement rate limiting for streaming connections
- **Timeout Handling**: Proper timeout and cleanup mechanisms

---

**This implementation provides a powerful hybrid approach that combines the reliability of JSON-RPC with the real-time capabilities of SSE streaming!** 🚀 