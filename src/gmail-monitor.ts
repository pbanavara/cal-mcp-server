import { google } from 'googleapis';
import { GmailMessage } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';

export class GmailMonitor {
  private gmail: any;
  private pollingInterval: NodeJS.Timeout | null = null;
  private onMessageReceived: (message: GmailMessage) => void;
  private seenMessageIds: Set<string> = new Set();

  constructor(onMessageReceived: (message: GmailMessage) => void) {
    this.onMessageReceived = onMessageReceived;
  }

  public async initialize(): Promise<boolean> {
    const token = await tokenManager.getToken();
    if (!token) {
      console.error('No tokens available for Gmail monitoring');
      return false;
    }

    // TokenManager.getToken() now automatically refreshes expired tokens
    // So we don't need to check expiration here anymore

    const oauth2Client = new google.auth.OAuth2(
      token.client_id,
      token.client_secret,
      token.token_uri
    );
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scope: token.scopes?.join(' ') || 'https://www.googleapis.com/auth/gmail.readonly',
      token_type: 'Bearer',
      expiry_date: token.expiry_date,
    });

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return true;
  }

  public startPolling(intervalMs: number = 60000): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.pollingInterval = setInterval(() => this.pollUnreadMessages(), intervalMs);
    // Run immediately on start
    this.pollUnreadMessages();
    console.log(`Started polling for unread emails every ${intervalMs / 1000} seconds.`);
  }

  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Stopped polling for unread emails.');
    }
  }

  private async pollUnreadMessages(): Promise<void> {
    if (!this.gmail) {
      console.error('Gmail client not initialized');
      return;
    }
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 10,
      });
      const messages = res.data.messages || [];
      for (const msg of messages) {
        if (this.seenMessageIds.has(msg.id)) continue;
        this.seenMessageIds.add(msg.id);
        const fullMsg = await this.gmail.users.messages.get({ userId: 'me', id: msg.id });
        this.onMessageReceived(fullMsg.data as GmailMessage);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }

  /**
   * Fetch unread messages, mark them as seen, and return them.
   * Does not trigger the onMessageReceived callback.
   */
  public async checkForNewMessages(): Promise<GmailMessage[]> {
    if (!this.gmail) {
      console.error('Gmail client not initialized');
      return [];
    }
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 10,
      });
      const messages = res.data.messages || [];
      const newMessages: GmailMessage[] = [];
      for (const msg of messages) {
        if (this.seenMessageIds.has(msg.id)) continue;
        this.seenMessageIds.add(msg.id);
        const fullMsg = await this.gmail.users.messages.get({ userId: 'me', id: msg.id });
        newMessages.push(fullMsg.data as GmailMessage);
        // Mark as read (remove UNREAD label)
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
      }
      return newMessages;
    } catch (err) {
      console.error('Error in checkForNewMessages:', err);
      return [];
    }
  }
} 