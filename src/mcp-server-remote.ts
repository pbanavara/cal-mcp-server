import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { GmailMonitor } from './gmail-monitor';
import { tokenManager } from './token-manager';
import { setNotifyCallback, startWebhookServer } from './webhook-server';
import { jwtAuthMiddleware, AuthenticatedRequest } from './jwt-auth-middleware';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';

// Initialize MCP server
const mcp = new McpServer(
  {
    name: 'mcp-email-agent',
    version: '1.0.0',
    title: 'MCP Email Agent',
    description: 'Remote MCP server for Gmail email monitoring and meeting detection',
  }
);

const gmailMonitor = new GmailMonitor(() => { });

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
  "Start watching for new emails using Gmail API",
  {
    parameters: {},
  },
  async () => {
    const watching = await gmailMonitor.startWatching();
    if (!watching) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to start watching for new emails."
          }
        ]
      };
    }
    return {
      content: [
        {
          type: "text",
          text: "Started watching for new emails."
        }
      ]
    };
  }
);

mcp.tool(
  "stop_watching_for_new_emails",
  "Stop watching for new emails",
  {
    parameters: {},
  },
  async () => {
    await gmailMonitor.stopWatching();
    return {
      content: [
        {
          type: "text",
          text: "Stopped watching for new emails."
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
  }
);

mcp.tool(
  "get_gmail_status",
  "Get the current status of Gmail monitoring",
  {
    parameters: {},
  },
  async () => {
    const status = gmailMonitor.getStatus();
    return {
      content: [
        {
          type: "text",
          text: `Gmail Status: ${JSON.stringify(status, null, 2)}`
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
    sessionIdGenerator: () => randomUUID(),
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
      await transport.handleRequest(req, res, req.body);
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
    await gmailMonitor.stopWatching();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await gmailMonitor.stopWatching();
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