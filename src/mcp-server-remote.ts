import 'dotenv/config';
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
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { setupMcpServer } from './mcp-mcp-logic';


// SSE clients management
interface SSEClient {
  id: string;
  res: any; // Express Response with write method
  userEmail?: string | undefined;
}

export class SSEManager {
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
const mcp = new McpServer({
  name: 'mcp-email-agent',
  version: '1.0.0',
  title: 'MCP Email Agent',
  description: 'Remote MCP server for Gmail email monitoring and meeting detection',
});

const gmailMonitor = new GmailMonitor(onNewGmailMessage);

// Set up MCP server tools and resources
setupMcpServer(mcp, gmailMonitor, sseManager);

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

// After creating each McpServer, GmailMonitor, and SSEManager, call setupMcpServer
// For each session/transport block where you create a new McpServer:
// const server = new McpServer({
//   name: "example-server",
//   version: "1.0.0"
// });
// setupMcpServer(server, gmailMonitor, sseManager);

// Remove all mcp.tool and mcp.resource definitions from this file. Only keep the import and call to setupMcpServer where needed.

// Top-level async initialization
let initPromise: Promise<void> | null = null;

async function topLevelInit() {
  try {
    // Check if tokens are available (optional - don't fail if none found)
    const hasTokens = await tokenManager.hasTokens();
    if (!hasTokens) {
      console.log('ℹ️  No authentication tokens found in DynamoDB.');
      console.log('ℹ️  Server will start without Gmail monitoring.');
      console.log('ℹ️  Gmail monitoring will be available once users authenticate.');
      return; // Don't throw error, just return
    }
    
    const tokenCount = await tokenManager.getTokenCount();
    console.log(`✅ Found ${tokenCount} token(s) in DynamoDB`);
    
    // Set up automatic token refresh
    await tokenManager.setupAutomaticRefresh();
    console.log('⏰ Automatic token refresh enabled');
    
    // Initialize Gmail monitor only if tokens are available
    const gmailInitialized = await initializeGmailMonitor();
    if (!gmailInitialized) {
      console.warn('⚠️  Failed to initialize Gmail monitor, but server will continue');
      return; // Don't throw error, just return
    }
    
    console.log('✅ Gmail monitor initialized successfully');
  } catch (err) {
    console.warn('⚠️  Error during initialization, but server will continue:', err);
    // Don't throw the error, just log it
  }
}

if (!initPromise) {
  initPromise = topLevelInit();
}

// Create Express app
const app = express();
const port = parseInt(process.env['MCP_SERVER_PORT'] || '3001');

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};


// Middleware with CORS management for SessionID
app.use(cors(
  {
    origin: '*', // Configure appropriately for production, for example:
    // origin: ['https://your-remote-domain.com', 'https://your-other-remote-domain.com'],
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }
));
app.use(express.json());

// Add this endpoint:
app.post('/mcp/session', (req: express.Request, res: express.Response) => {
  // Generate a new session token (UUID)
  console.log('🔧 POST /mcp/session received');
  console.log('Headers:', req.headers);
  const sessionToken = randomUUID();
  console.log('Generated session token:', sessionToken);
  // Optionally: store/track the sessionToken if you want to manage sessions
  res.json({ sessionToken });
});

// Create MCP transport (persistent)

// MCP endpoint with JWT authentication
app.post('/mcp', jwtAuthMiddleware.authenticateJWT, async (req: AuthenticatedRequest, res: express.Response) => {
  console.log('🔧 POST /mcp received');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log(`👤 Authenticated user: ${req.user?.email}`);

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;
  // Check for initialize request
  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      },
      // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
      // locally, make sure to set:
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    // Connect to the MCP server
    await mcp.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);

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
      gmailMonitor.startPolling(30000);

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

app.get('/mcp', jwtAuthMiddleware.authenticateJWT, async (req: AuthenticatedRequest, res: express.Response) => {
  console.log('🔧 GET /mcp received');
  console.log('Headers:', req.headers);
  console.log(`👤 Authenticated user: ${req.user?.email}`);

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports[sessionId];
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
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'mcp-email-server-remote'
  });
});

// SSE endpoint for real-time notifications
app.get('/sse', (req: express.Request, res: express.Response) => {
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
app.get('/sse/status', (_req: express.Request, res: express.Response) => {
  res.json({
    connectedClients: sseManager.getClientCount(),
    timestamp: new Date().toISOString()
  });
});

// Add a default route for '/'
app.get('/', (_req: express.Request, res: express.Response) => {
  res.send(`
      <html>
        <head>
          <title>Welcome to the MCP Server</title>
          <style>
            body { font-family: sans-serif; margin: 2em; }
            pre { background: #f4f4f4; padding: 1em; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>Welcome to the MCP Server</h1>
          <p>
            This is a Model Context Protocol (MCP) server.<br/>
            To connect a client, use the following example configuration:
          </p>
          <pre>
{
  "mcpServers": [
    {
      "name": "rekura-email-agent",
      "transport": "http",
      "url": "https://your-vercel-app.vercel.app/mcp",
      "auth": {
        "type": "bearer",
        "token": "&lt;your JWT token here&gt;"
      }
    }
  ]
}
          </pre>
          <p>
            Replace <code>&lt;your JWT token here&gt;</code> with your actual token.<br/>
            For more information, see the <a href="https://modelcontextprotocol.io/docs/">MCP documentation</a>.
          </p>
        </body>
      </html>
    `);
});

// Start the server for both development and production
const serverPort = parseInt(process.env['PORT'] || port.toString());
app.listen(serverPort, '0.0.0.0', () => {
  console.log(`🚀 Remote MCP Email Server running on port ${serverPort}`);
  console.log(`🔧 MCP endpoint: http://0.0.0.0:${serverPort}/mcp`);
  console.log(`💚 Health check: http://0.0.0.0:${serverPort}/health`);
  console.log(`📡 SSE endpoint: http://0.0.0.0:${serverPort}/sse`);
  console.log('✅ Ready for client connections via HTTP');
  console.log('ℹ️  Note: Gmail monitoring will be available once users authenticate');
});

// Export the app for Vercel (production)
export default app;

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