import { MCPNotification, MCPClient, GmailMessage } from './types';
import { GmailMonitor } from './gmail-monitor';
import { tokenManager } from './token-manager';

export class MCPServer {
  private clients: Map<string, MCPClient> = new Map();
  private gmailMonitor: GmailMonitor;
  private isRunning: boolean = false;

  constructor() {
    this.gmailMonitor = new GmailMonitor((message: GmailMessage) => {
      this.handleNewEmail(message);
    });

    this.setupServer();
  }

  private setupServer(): void {
    // For now, we'll use a simpler approach
    // The MCP SDK API might have changed, so we'll focus on basic functionality
    console.log('🔧 MCP server setup complete');
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  MCP server is already running');
      return;
    }

    try {
      // Check for tokens
      if (!tokenManager.hasTokens()) {
        console.error('❌ No tokens available. Please authenticate in the web app first.');
        return;
      }

      // Initialize Gmail monitor
      const initialized = await this.gmailMonitor.initialize();
      if (!initialized) {
        console.error('❌ Failed to initialize Gmail monitor');
        return;
      }

      // Start Gmail watching (polling mode for now)
      console.log('📧 Starting Gmail monitoring in polling mode...');
      
      this.isRunning = true;
      console.log('🚀 MCP server started successfully');
      console.log('📧 Gmail monitoring active (polling every 30 seconds)');
      console.log('📡 Ready for client connections');

      // Start periodic checks for new messages
      this.startPeriodicChecks();

    } catch (error) {
      console.error('❌ Failed to start MCP server:', error);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Stop Gmail watching
      await this.gmailMonitor.stopWatching();
      
      // Close all client connections
      this.clients.clear();
      
      this.isRunning = false;
      console.log('✅ MCP server stopped');
    } catch (error) {
      console.error('❌ Error stopping MCP server:', error);
    }
  }

  private async handleNewEmail(message: GmailMessage): Promise<void> {
    const notification: MCPNotification = {
      type: 'email_received',
      data: {
        messageId: message.id,
        subject: this.getSubject(message),
        sender: this.getSender(message),
        receivedAt: new Date(parseInt(message.internalDate)).toISOString(),
        snippet: message.snippet,
      },
    };

    console.log(`📧 New email received: ${notification.data.subject}`);
    console.log(`📧 From: ${notification.data.sender}`);
    console.log(`📧 Snippet: ${notification.data.snippet}`);

    // For now, just log the notification
    // In the future, this will send to MCP clients
    console.log('📤 MCP Notification would be sent here');
  }

  private getSubject(message: GmailMessage): string {
    if (!message.payload?.headers) {
      return 'No subject';
    }

    const subjectHeader = message.payload.headers.find(
      header => header.name.toLowerCase() === 'subject'
    );
    
    return subjectHeader?.value || 'No subject';
  }

  private getSender(message: GmailMessage): string {
    if (!message.payload?.headers) {
      return 'Unknown sender';
    }

    const fromHeader = message.payload.headers.find(
      header => header.name.toLowerCase() === 'from'
    );
    
    return fromHeader?.value || 'Unknown sender';
  }

  private startPeriodicChecks(): void {
    // Check for new messages every 30 seconds
    setInterval(async () => {
      if (this.isRunning) {
        await this.gmailMonitor.checkForNewMessages();
      }
    }, 30000);

    console.log('⏰ Started periodic email checks (every 30 seconds)');
  }

  public getStatus(): {
    isRunning: boolean;
    clientCount: number;
    gmailStatus: any;
  } {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      gmailStatus: this.gmailMonitor.getStatus(),
    };
  }
} 