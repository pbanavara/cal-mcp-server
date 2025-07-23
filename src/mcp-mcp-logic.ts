import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GmailMonitor } from './gmail-monitor';
import { SSEManager } from './mcp-server-remote'; // If SSEManager is not exported, move its definition here or pass as argument
import { CalendarMonitor } from './calendar-monitor';
import { FreeSlot } from './types';

export function setupMcpServer(mcp: McpServer, gmailMonitor: GmailMonitor, sseManager: SSEManager) {
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
      // Streaming mode cleanup is handled in main file
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
      return {
        content: [
          {
            type: "text",
            text: `Search feature not yet implemented. Query: "${query}", max results: ${maxResults}`
          }
        ]
      };
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

  // CalendarMonitor instance (singleton for now)
  const calendarMonitor = new CalendarMonitor();

  mcp.tool(
    "check_calendar_availability",
    "Check Google Calendar for free slots in the next 2 days (9am-6pm, 30min slots)",
    {
      parameters: {},
    },
    async () => {
      const initialized = await calendarMonitor.initialize();
      if (!initialized) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to initialize Google Calendar client."
            }
          ]
        };
      }
      const slots: FreeSlot[] = await calendarMonitor.getFreeSlots();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(slots, null, 2)
          }
        ]
      };
    }
  );

  mcp.tool(
    "check_calendar_availability_for_dates",
    "Check Google Calendar for free slots for specific dates and timezone (9am-6pm, 30min slots)",
    {
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description: "Array of date strings (YYYY-MM-DD)"
          },
          timeZone: {
            type: "string",
            description: "Timezone string (e.g., 'UTC+8')"
          }
        },
        required: ["dates", "timeZone"]
      },
    },
    async ({ dates, timeZone }) => {
      const initialized = await calendarMonitor.initialize();
      if (!initialized) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to initialize Google Calendar client."
            }
          ]
        };
      }
      const slots: FreeSlot[] = await calendarMonitor.getFreeSlotsForDates(dates, timeZone);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(slots, null, 2)
          }
        ]
      };
    }
  );
} 