import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GmailMonitor } from './gmail-monitor';
import { tokenManager } from './token-manager';
import { setNotifyCallback, startWebhookServer } from './webhook-server';

// Initialize MCP server
const mcp = new McpServer(
  {
    name: 'mcp-email-agent',
    version: '1.0.0',
      title: 'MCP Email Agent',
      description: 'MCP server for Gmail email monitoring and meeting detection',
    }
  );

const gmailMonitor = new GmailMonitor(() => { });
async () => {
  const initialized = await gmailMonitor.initialize();
  // Start the webhook server for gmail notifications
  if (!initialized) {
    console.error("Failed to initialize Gmail monitor.");
  }
  setNotifyCallback((messageId) => {
    console.error(`New email received: ${messageId}`);

  });
  startWebhookServer();
}


// Start watching for new emails
mcp.tool(
  "start_watching_for_new_emails",
  "Start watching for new emails",
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

// Register "get_recent_emails" tool
mcp.tool(
  "get_email_alerts",
  "Get email alerts in detail",
  {
    parameters: {},
  },
  async () => {
    const token = tokenManager.getToken();
    if (!token) {
      return {
        content: [
          {
            type: "text",
            text: "No tokens available. Please authenticate in the web app first."
          }
        ]
      };
    }

    const gmailMonitor = new GmailMonitor(() => {});
    const initialized = await gmailMonitor.initialize();
    if (!initialized) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to initialize Gmail monitor."
          }
        ]
      };
    }

    // Fetch the 5 most recent emails from the INBOX
    const gmail = gmailMonitor['gmail'];
    if (!gmail) {
      return {
        content: [
          {
            type: "text",
            text: "Gmail client not initialized."
          }
        ]
      };
    }

    try {
      const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 5,
        labelIds: ['INBOX'],
      });

      const messages = res.data.messages || [];
      if (messages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No recent emails found."
            }
          ]
        };
      }

      // Fetch full details for each message
      const emailContents = [];
      for (const msg of messages) {
        const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        const payload = fullMsg.data.payload;
        const headers = payload?.headers || [];
        const subject = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'subject')?.value || 'No subject';
        const from = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'from')?.value || 'Unknown sender';
        const snippet = fullMsg.data.snippet || '';
        emailContents.push({
          type: "text",
          text: `Subject: ${subject}\nFrom: ${from}\nSnippet: ${snippet}`
        });
      }

      return {
        content: emailContents.map(email => ({
          type: "text",
          text: email.text
        }))
      };

    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
        msg = (err as any).message;
      } else if (typeof err === "string") {
        msg = err;
      }
      return {
        content: [
          {
            type: "text",
            text: "Error fetching emails: " + msg
          }
        ]
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error("Email MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});