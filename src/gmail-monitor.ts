import { google } from 'googleapis';
import { GmailMessage } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';
import { CalendarMonitor } from './calendar-monitor';

export class GmailMonitor {
  private gmail: any;
  private pollingInterval: NodeJS.Timeout | null = null;
  private onMessageReceived: (message: GmailMessage) => void;
  private seenMessageIds: Set<string> = new Set();
  private calendarMonitor: CalendarMonitor;

  constructor(onMessageReceived: (message: GmailMessage) => void) {
    this.onMessageReceived = onMessageReceived;
    this.calendarMonitor = new CalendarMonitor();
  }

  // Mock method to check if a message is meeting related
  private checkIfMessageMeetingRelated(message: string) {
    // Mock: always returns a meeting for demonstration
    return {
      message,
      meeting: 'yes',
      time: ['2025-07-23', '2025-07-22'],
      time_zone: '+08:00'
    };
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

  // Method to compose and send an email as a reply
  private async composeAndSendEmail(to: string, subject: string, body: string, threadId?: string, inReplyTo?: string) {
    if (!this.gmail) {
      console.error('Gmail client not initialized');
      return;
    }
    try {
      const headers = [
        `To: ${to}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
      ];
      if (inReplyTo) {
        headers.push(`In-Reply-To: <${inReplyTo}>`);
        headers.push(`References: <${inReplyTo}>`);
      }
      const messageParts = [
        ...headers,
        '',
        body
      ];
      const message = messageParts.join('\n');
      const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: threadId || undefined
        }
      });
      console.log(`Sent email to ${to} with subject: ${subject}`);
    } catch (err) {
      console.error('Error sending email:', err);
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

        // --- New logic: check if meeting related and get calendar slots ---
        const snippet = (fullMsg.data as GmailMessage).snippet || '';
        const meetingInfo = this.checkIfMessageMeetingRelated(snippet);
        if (meetingInfo.meeting === 'yes') {
          // Initialize calendar monitor if needed
          const initialized = await this.calendarMonitor.initialize();
          if (initialized) {
            const slots = await this.calendarMonitor.getFreeSlotsForDates(meetingInfo.time, meetingInfo.time_zone);
            console.log('Available slots for meeting-related email:', JSON.stringify(slots, null, 2));
            // Extract sender email from headers
            const headers = (fullMsg.data as GmailMessage).payload?.headers || [];
            const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
            const toEmail = fromHeader ? fromHeader.value.replace(/.*<(.+)>/, '$1').trim() : '';
            const threadId = (fullMsg.data as GmailMessage).threadId;
            const inReplyTo = headers.find(h => h.name.toLowerCase() === 'message-id')?.value;
            if (toEmail) {
              // Get the authenticated user's email for the assistant identity
              const token = await tokenManager.getToken();
              const assistantEmail = token?.user_email || 'your-assistant';
              const body = `This is Amy <${assistantEmail}>'s assistant responding. Here are some of the available slots, let me know which of these work for you.\n\n${JSON.stringify(slots, null, 2)}`;
              await this.composeAndSendEmail(
                toEmail,
                'Available Meeting Slots',
                body,
                threadId,
                inReplyTo
              );
            } else {
              console.log('Could not determine sender email to reply with available slots.');
            }
          } else {
            console.log('Could not initialize CalendarMonitor for meeting-related email.');
          }
        }
        // --- End new logic ---
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