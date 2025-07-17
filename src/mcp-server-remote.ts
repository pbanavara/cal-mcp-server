import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { GmailMonitor } from './gmail-monitor';
import { tokenManager } from './token-manager';
import { setNotifyCallback, startWebhookServer } from './webhook-server';
import { jwtAuthMiddleware, AuthenticatedRequest } from './jwt-auth-middleware';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { GmailMessage } from './types';

// SSE clients management
interface SSEClient {
  id: string;
  res: any; // Express Response with write method
  userEmail?: string | undefined;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(clientId: string, res: any, userEmail?: string): void {
    this.clients.set(clientId, { id: clientId, res, userEmail });
    console.log(`📡 SSE client connected: ${clientId} (${this.clients.size} total)`);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`📡 SSE client disconnected: ${clientId} (${this.clients.size} remaining)`);
  }

  broadcastToAll(event: string, data: any): void {
    const message = `data: ${JSON.stringify({ event, data, timestamp: new Date().toISOString() })}\n\n`;
    
    this.clients.forEach((client, clientId) => {
      try {
        client.res.write(message);
      } catch (error) {
        console.error(`Error sending SSE to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    });
  }

  broadcastToUser(userEmail: string, event: string, data: any): void {
    const message = `data: ${JSON.stringify({ event, data, timestamp: new Date().toISOString() })}\n\n`;
    
    this.clients.forEach((client, clientId) => {
      if (client.userEmail === userEmail) {
        try {
          client.res.write(message);
        } catch (error) {
          console.error(`Error sending SSE to client ${clientId}:`, error);
          this.removeClient(clientId);
        }
      }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

const sseManager = new SSEManager();

// Global state to track if we're in streaming mode
let isStreamingMode = false;
let streamingRes: any = null;

// Initialize MCP server
const mcp = new McpServer(
  {
    name: 'mcp-email-agent',
    version: '1.0.0',
    title: 'MCP Email Agent',
    description: 'Remote MCP server for Gmail email monitoring and meeting detection',
  }
);

const gmailMonitor = new GmailMonitor(onNewGmailMessage);

// Notification mechanism for connected clients
function onNewGmailMessage(message: GmailMessage) {
  console.log('📧 New Gmail message detected:', message.id);
  
  // Extract email details for notification
  const subject = message.payload?.headers?.find(h => h.name.toLowerCase() === 'subject')?.value || 'No subject';
  const from = message.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown sender';
  
  const notificationData = {
    messageId: message.id,
    subject,
    from,
    snippet: message.snippet,
    receivedAt: new Date(parseInt(message.internalDate)).toISOString()
  };

  // Send through MCP streaming if active
  if (isStreamingMode && streamingRes) {
    try {
      const mcpNotification = {
        jsonrpc: '2.0',
        method: 'notifications/notify',
        params: {
          notification: {
            type: 'new_email',
            message: `New email: ${subject}`,
            data: notificationData
          }
        }
      };
      
      streamingRes.write(`data: ${JSON.stringify(mcpNotification)}\n\n`);
      console.log('📡 Sent email notification through MCP streaming');
    } catch (error) {
      console.error('Error sending MCP notification:', error);
      isStreamingMode = false;
      streamingRes = null;
    }
  }

  // Also broadcast to all connected SSE clients (for web apps)
  sseManager.broadcastToAll('new_email', notificationData);
}

// Initialize Gmail monitor
async function initializeGmailMonitor() {
  const initialized = await gmailMonitor.initialize();
  if (!initialized) {
    console.error("Failed to initialize Gmail monitor.");
    return false;
  }
  
  setNotifyCallback((messageId) => {
    console.log(`New email received: ${messageId}`);
    // Send notification to all connected MCP clients
    // This will be handled by the MCP protocol
  });
  
  startWebhookServer();
  return true;
}

// MCP Tools

mcp.tool(
  "start_watching_for_new_emails",
  "Start polling for new emails using Gmail API",
  {
    parameters: {},
  },
  async () => {
    gmailMonitor.startPolling(60000); // Poll every 60 seconds
    return {
      content: [
        {
          type: "text",
          text: "Started polling for new emails."
        }
      ]
    };
  }
);

mcp.tool(
  "stop_watching_for_new_emails",
  "Stop polling for new emails and exit streaming mode",
  {
    parameters: {},
  },
  async () => {
    gmailMonitor.stopPolling();
    
    // Exit streaming mode
    if (isStreamingMode && streamingRes) {
      try {
        const stopResponse = {
          jsonrpc: '2.0',
          method: 'notifications/notify',
          params: {
            notification: {
              type: 'email_monitoring_stopped',
              message: 'Email monitoring stopped. Returning to regular mode.'
            }
          }
        };
        
        streamingRes.write(`data: ${JSON.stringify(stopResponse)}\n\n`);
        
        // Close streaming connection
        streamingRes.end();
      } catch (error) {
        console.error('Error stopping streaming:', error);
      }
    }
    
    isStreamingMode = false;
    streamingRes = null;
    
    return {
      content: [
        {
          type: "text",
          text: "Stopped polling for new emails and exited streaming mode."
        }
      ]
    };
  }
);

mcp.tool(
  "check_for_new_messages",
  "Manually check for new messages",
  {
    parameters: {},
  },
  async () => {
    try {
      const messages = await gmailMonitor.checkForNewMessages();
      if (!messages.length) {
        return {
          content: [
            {
              type: "text",
              text: "Checked for new messages. No new messages found."
            }
          ]
        };
      }
      return {
        content: messages.map(msg => ({
          type: "text",
          text: `Subject: ${msg.payload?.headers?.find(h => h.name.toLowerCase() === "subject")?.value || "No subject"}\nFrom: ${msg.payload?.headers?.find(h => h.name.toLowerCase() === "from")?.value || "Unknown"}\nSnippet: ${msg.snippet}`
        }))
      };
    } catch (error) {
      console.error('Error in check_for_new_messages:', error);
      return {
        content: [
          {
            type: "text",
            text: `Error checking for new messages: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

mcp.tool(
  "get_gmail_status",
  "Get the current status of Gmail monitoring",
  {
    parameters: {},
  },
  async () => {
    // Placeholder status
    return {
      content: [
        {
          type: "text",
          text: `Gmail Status: polling active = ${!!gmailMonitor['pollingInterval']}`
        }
      ]
    };
  }
);

mcp.tool(
  "search_emails",
  "Search emails in Gmail",
  {
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results (default: 10)",
          default: 10
        }
      },
      required: ["query"]
    },
  },
  async ({ query, maxResults = 10 }) => {
    try {
      // For now, return a placeholder since searchEmails doesn't exist
      return {
        content: [
          {
            type: "text",
            text: `Search feature not yet implemented. Query: "${query}", max results: ${maxResults}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching emails: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

mcp.tool(
  "detect_meetings_in_email",
  "Analyze an email for meeting-related content",
  {
    parameters: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "Gmail message ID"
        }
      },
      required: ["messageId"]
    },
  },
  async ({ messageId }) => {
    try {
      // For now, return a placeholder since detectMeetingsInEmail doesn't exist
      return {
        content: [
          {
            type: "text",
            text: `Meeting detection feature not yet implemented. Message ID: ${messageId}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error detecting meetings: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

mcp.tool(
  "get_sse_status",
  "Get the current status of SSE connections",
  {
    parameters: {},
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `SSE Status: ${sseManager.getClientCount()} connected clients`
        }
      ]
    };
  }
);

// MCP Resources

mcp.resource(
  "gmail_inbox",
  "Gmail inbox messages",
  {
    mimeType: "application/json",
    description: "Current Gmail inbox messages"
  },
  async () => {
    try {
      // For now, return a placeholder since getRecentEmails doesn't exist
      return {
        contents: [
          {
            uri: "gmail://inbox",
            mimeType: "application/json",
            text: JSON.stringify({ message: "Gmail inbox resource not yet implemented" }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: "gmail://inbox",
            mimeType: "application/json",
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)
          }
        ]
      };
    }
  }
);

// Main function
async function main() {
  console.log('Starting Remote MCP Email Monitor Server...');
  
  // Check if tokens are available
  if (!tokenManager.hasTokens()) {
    console.error('No authentication tokens found.');
    console.error('Please authenticate in the web app first: http://localhost:8080');
    process.exit(1);
  }

  console.log(`Found ${tokenManager.getTokenCount()} token(s)`);
  console.log(`Token file: ${tokenManager.getTokenFile()}`);

  // Initialize Gmail monitor
  const gmailInitialized = await initializeGmailMonitor();
  if (!gmailInitialized) {
    console.error('Failed to initialize Gmail monitor');
    process.exit(1);
  }

  // Create Express app
  const app = express();
  const port = parseInt(process.env['MCP_SERVER_PORT'] || '3001');
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Add this endpoint:
  app.post('/mcp/session', (req, res) => {
    // Generate a new session token (UUID)
    console.log('🔧 POST /mcp/session received');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    const sessionToken = randomUUID();
    console.log('Generated session token:', sessionToken);
    // Optionally: store/track the sessionToken if you want to manage sessions
    res.json({ sessionToken });
  });

  // Create MCP transport (persistent)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => 'cursor-session-fresh-67890', // Use fixed session ID to match client
  });

  // Connect MCP server to transport
  await mcp.connect(transport);
  
  // MCP endpoint with JWT authentication
  app.post('/mcp', jwtAuthMiddleware.authenticateJWT, async (req: AuthenticatedRequest, res) => {
    console.log('🔧 POST /mcp received');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log(`👤 Authenticated user: ${req.user?.email}`);
    
    try {
      // Check if this is a start_watching_for_new_emails request
      const isStartWatching = req.body?.method === 'tools/call' && 
                             req.body?.params?.name === 'start_watching_for_new_emails';
      
      if (isStartWatching) {
        // Switch to streaming mode
        isStreamingMode = true;
        streamingRes = res;
        
        // Set SSE headers for streaming
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        // Send initial response
        const initialResponse = {
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            content: [
              {
                type: "text",
                text: "Started polling for new emails. Switching to streaming mode for real-time notifications."
              }
            ]
          }
        };
        
        res.write(`data: ${JSON.stringify(initialResponse)}\n\n`);
        
        // Start the email monitoring
        gmailMonitor.startPolling(60000);
        
        // Keep connection alive and send notifications
        const keepAliveInterval = setInterval(() => {
          if (isStreamingMode && streamingRes) {
            try {
              res.write(`data: ${JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/notify',
                params: {
                  notification: {
                    type: 'email_monitoring_active',
                    message: 'Email monitoring is active and polling for new messages...'
                  }
                }
              })}\n\n`);
            } catch (error) {
              console.error('Error sending keep-alive:', error);
              clearInterval(keepAliveInterval);
              isStreamingMode = false;
              streamingRes = null;
            }
          } else {
            clearInterval(keepAliveInterval);
          }
        }, 30000); // Send keep-alive every 30 seconds
        
        // Handle client disconnect
        req.on('close', () => {
          console.log('📡 MCP streaming client disconnected');
          isStreamingMode = false;
          streamingRes = null;
          clearInterval(keepAliveInterval);
          gmailMonitor.stopPolling();
        });
        
      } else if (isStreamingMode) {
        // In streaming mode, send response through SSE
        const response = await transport.handleRequest(req, res, req.body);
        if (streamingRes) {
          try {
            streamingRes.write(`data: ${JSON.stringify(response)}\n\n`);
          } catch (error) {
            console.error('Error sending streaming response:', error);
            isStreamingMode = false;
            streamingRes = null;
          }
        }
      } else {
        // Regular JSON-RPC mode
        await transport.handleRequest(req, res, req.body);
      }
      
      console.log('✅ POST /mcp handled successfully');
    } catch (error) {
      console.error('❌ Error handling POST /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', jwtAuthMiddleware.authenticateJWT, async (req: AuthenticatedRequest, res) => {
    console.log('🔧 GET /mcp received');
    console.log('Headers:', req.headers);
    console.log(`👤 Authenticated user: ${req.user?.email}`);
    
    try {
      await transport.handleRequest(req, res);
      console.log('✅ GET /mcp handled successfully');
    } catch (error) {
      console.error('❌ Error handling GET /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });
  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'mcp-email-server-remote'
    });
  });

  // SSE endpoint for real-time notifications
  app.get('/sse', (req, res) => {
    const clientId = randomUUID();
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ 
      event: 'connected', 
      clientId, 
      timestamp: new Date().toISOString() 
    })}\n\n`);

    // Add client to SSE manager
    sseManager.addClient(clientId, res);

    // Handle client disconnect
    req.on('close', () => {
      sseManager.removeClient(clientId);
    });

    req.on('error', () => {
      sseManager.removeClient(clientId);
    });
  });

  // SSE status endpoint
  app.get('/sse/status', (_req, res) => {
    res.json({
      connectedClients: sseManager.getClientCount(),
      timestamp: new Date().toISOString()
    });
  });
  
  // Start HTTP server
  app.listen(port, () => {
    console.log(`Remote MCP Email Server running on http://localhost:${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log('Ready for client connections via HTTP');
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    gmailMonitor.stopPolling();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    gmailMonitor.stopPolling();
    process.exit(0);
  });

  // Add additional error handling
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    console.error('Stack trace:', error.stack);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Failed to start remote MCP server:', error);
  process.exit(1);
}); 