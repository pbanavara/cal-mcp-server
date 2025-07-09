import { google } from 'googleapis';
import { GmailMessage, GmailHistoryResponse } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';

export class GmailMonitor {
  private gmail: any;
  private currentHistoryId: string | null = null;
  private watchExpiration: string | null = null;
  private isWatching: boolean = false;
  private onMessageReceived: (message: GmailMessage) => void;
  private pubsubTopic: string;

  constructor(onMessageReceived: (message: GmailMessage) => void) {
    this.onMessageReceived = onMessageReceived;
    
    // Get Pub/Sub topic from environment or use default
    this.pubsubTopic = process.env['GMAIL_WATCH_TOPIC'] || 
                      'projects/your-project-id/topics/gmail-notifications';
  }

  public async initialize(): Promise<boolean> {
    const token = tokenManager.getToken();
    if (!token) {
      console.error('No tokens available for Gmail monitoring');
      return false;
    }

    if (tokenManager.isTokenExpired(token)) {
      console.error('Token is expired. Please re-authenticate in the web app.');
      return false;
    }

    // Initialize Gmail API client with client credentials
    const oauth2Client = new google.auth.OAuth2(
      token.client_id,
      token.client_secret,
      token.token_uri
    );
    
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scope: token.scopes?.join(' ') || token.scope || 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: token.token_type || null,
      expiry_date: token.expiry_date,
    });

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      // Get current history ID
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.currentHistoryId = profile.data.historyId;
      console.error(`Gmail monitor initialized. Current history ID: ${this.currentHistoryId}`);
      console.error(`Pub/Sub topic: ${this.pubsubTopic}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize Gmail monitor:', error);
      return false;
    }
  }

  public async startWatching(): Promise<boolean> {
    if (!this.gmail) {
      console.error('Gmail client not initialized');
      return false;
    }

    try {
      console.error(`Starting Gmail watch with Pub/Sub topic: ${this.pubsubTopic}`);
      
      // Start watching for changes
      const watchResponse = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: this.pubsubTopic,
          labelIds: ['INBOX'],
        },
      });

      this.watchExpiration = watchResponse.data.expiration;
      this.isWatching = true;
      
      console.error(`Gmail watch started successfully!`);
      console.error(`Watch expires: ${this.watchExpiration}`);
      console.error(`Monitoring for new emails via Pub/Sub...`);
      
      return true;
    } catch (error) {
      console.error('Failed to start Gmail watch:', error);
      console.error('Make sure:');
      console.error('   1. Your Pub/Sub topic exists: ' + this.pubsubTopic);
      console.error('   2. Gmail API has permission to publish to the topic');
      console.error('   3. Your service account has proper permissions');
      return false;
    }
  }

  public async stopWatching(): Promise<void> {
    if (!this.gmail || !this.isWatching) {
      return;
    }

    try {
      await this.gmail.users.stop({ userId: 'me' });
      this.isWatching = false;
      this.watchExpiration = null;
      console.error('Gmail watch stopped');
    } catch (error) {
      console.error('Failed to stop Gmail watch:', error);
    }
  }

  public async checkForNewMessages(): Promise<GmailMessage[]> {
    const newMessages: GmailMessage[] = [];
    if (!this.gmail || !this.currentHistoryId) {
      console.log('Gmail client not initialized or current history ID not set');
      return newMessages;
    }

    try {
      // Get history since last check
      const historyResponse = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: this.currentHistoryId,
        historyTypes: ['messageAdded'],
      });

      const history = historyResponse.data as GmailHistoryResponse;
      console.log('History response:', history);
      if (history.history && history.history.length > 0) {
        for (const historyItem of history.history) {
          if (historyItem.messagesAdded) {
            for (const messageAdded of historyItem.messagesAdded) {
              const message = messageAdded.message;
              
              // Get full message details
              const fullMessage = await this.gmail.users.messages.get({
                userId: 'me',
                id: message.id,
              });

              const gmailMessage = fullMessage.data as GmailMessage;
              newMessages.push(gmailMessage);
              this.onMessageReceived(gmailMessage);
            }
          }
        }
        
        // Update history ID
        this.currentHistoryId = history.historyId;
      }
    } catch (error) {
      console.error('Error checking for new messages:', error);
    }
    return newMessages;
  }

  public getStatus(): {
    isWatching: boolean;
    currentHistoryId: string | null;
    watchExpiration: string | null;
    pubsubTopic: string;
  } {
    return {
      isWatching: this.isWatching,
      currentHistoryId: this.currentHistoryId,
      watchExpiration: this.watchExpiration,
      pubsubTopic: this.pubsubTopic,
    };
  }

  public async refreshWatch(): Promise<void> {
    if (this.isWatching && this.watchExpiration) {
      const expirationTime = new Date(this.watchExpiration).getTime();
      const now = Date.now();
      
      // Refresh if expiring within 5 minutes
      if (expirationTime - now < 5 * 60 * 1000) {
        console.error('Refreshing Gmail watch...');
        await this.stopWatching();
        await this.startWatching();
      }
    }
  }
} 