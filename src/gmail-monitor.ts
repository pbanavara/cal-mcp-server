import { google } from 'googleapis';
import { GmailMessage } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';
import { CalendarMonitor } from './calendar-monitor';
import { MeetingIntentDetector } from './meeting-intent-detector';
import { MeetingInfo } from './types';
import { simpleParser } from 'mailparser';

export class GmailMonitor {
  private gmail: any;
  private pollingInterval: NodeJS.Timeout | null = null;
  private onMessageReceived: (message: GmailMessage) => void;
  private seenMessageIds: Set<string> = new Set();
  private calendarMonitor: CalendarMonitor;
  private meetingIntentDetector: MeetingIntentDetector;

  constructor(onMessageReceived: (message: GmailMessage) => void) {
    this.onMessageReceived = onMessageReceived;
    this.calendarMonitor = new CalendarMonitor();
    this.meetingIntentDetector = new MeetingIntentDetector();
  }

  // Real method to check if a message is meeting related using Claude
  private async checkIfMessageMeetingRelated(message: string, timeZone: string): Promise<any> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return this.meetingIntentDetector.checkIfMessageMeetingRelated(message, today, timeZone);
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

  // Method to compose and send an email as a reply, supporting HTML quoting
  private async composeAndSendEmail(
    to: string,
    subject: string,
    body: string,
    threadId?: string,
    inReplyTo?: string,
    originalRaw?: string
  ) {
    if (!this.gmail) {
      console.error('Gmail client not initialized');
      return;
    }
    let originalHtml = '';
    let originalText = '';
    if (originalRaw) {
      try {
        const parsed = await simpleParser(Buffer.from(originalRaw, 'base64'));
        originalHtml = parsed.html || '';
        originalText = parsed.text || '';
      } catch (err) {
        console.error('Failed to parse original message for quoting:', err);
      }
    }
    // Format quoted original
    let quotedHtml = '';
    let quotedText = '';
    if (originalHtml) {
      quotedHtml = `<div style="border-left:2px solid #ccc; margin:0 0 0 8px; padding-left:8px; color:#555;">${originalHtml}</div>`;
    } else if (originalText) {
      quotedText = originalText.split('\n').map(line => `&gt; ${line}`).join('<br>');
      quotedHtml = `<div style="color:#555;">${quotedText}</div>`;
    }
    // Compose HTML reply
    const htmlBody = `
      <br>
      ${body}
      <br><br>
      <div style="font-size:0.9em; color:#888;">On reply:</div>
      ${quotedHtml}
    `;
    // Compose plain text reply
    const textBody = `This is Amy's assistant responding. Here are some of the available slots, let me know which of these work for you:\n\n${body}\n\nOn reply:\n${originalText}`;
    try {
      const messageParts = [
        `To: ${to}`,
        'Content-Type: multipart/alternative; boundary="boundary42"',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        ...(inReplyTo ? [
          `In-Reply-To: <${inReplyTo}>`,
          `References: <${inReplyTo}>`
        ] : []),
        '',
        '--boundary42',
        'Content-Type: text/plain; charset=utf-8',
        '',
        textBody,
        '--boundary42',
        'Content-Type: text/html; charset=utf-8',
        '',
        htmlBody,
        '--boundary42--'
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
        const defaultTimeZone = '+00:00';
        let meetingInfo: MeetingInfo;
        try {
          meetingInfo = await this.checkIfMessageMeetingRelated(snippet, defaultTimeZone);
        } catch (err) {
          console.error('Error calling Claude for meeting intent:', err);
          continue;
        }
        // Use the new structure: check if there are suggested meeting times
        if (meetingInfo && meetingInfo.suggested_meeting_times && meetingInfo.suggested_meeting_times.length > 0) {
          // Use all suggested dates and the timezone from the first suggestion
          const dates = meetingInfo.suggested_meeting_times.map(s => s.date);
          const timeZone = (meetingInfo.suggested_meeting_times[0] && meetingInfo.suggested_meeting_times[0].timezone) ? meetingInfo.suggested_meeting_times[0].timezone : defaultTimeZone;
          
          console.log('Claude suggested dates:', dates);
          console.log('Claude suggested timezone:', timeZone);
          
          // Initialize calendar monitor if needed
          const initialized = await this.calendarMonitor.initialize();
          if (initialized) {
            const slots = await this.calendarMonitor.getFreeSlotsForDates(dates, timeZone);
            console.log('Available slots for meeting-related email:', JSON.stringify(slots, null, 2));
            // Extract sender email from headers
            const headers = (fullMsg.data as GmailMessage).payload?.headers || [];
            const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
            const toEmail = fromHeader ? fromHeader.value.replace(/.*<(.+)>/, '$1').trim() : '';
            const threadId = (fullMsg.data as GmailMessage).threadId;
            const inReplyTo = headers.find(h => h.name.toLowerCase() === 'message-id')?.value;
            const originalRaw = (fullMsg.data as GmailMessage).payload?.body?.data;
            const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
            const originalSubject = subjectHeader ? 
              (subjectHeader.value.startsWith('Re:') ? subjectHeader.value : `Re: ${subjectHeader.value}`) : 
              'Re: ';
            if (toEmail) {
              // Get the authenticated user's email for the assistant identity
              const token = await tokenManager.getToken();
              const assistantEmail = token?.user_email || 'your-assistant';
              // Format up to 3 business-hours slots as a list
              const businessSlots = slots.filter(slot => {
                const hour = new Date(slot.start).getHours();
                return hour >= 9 && hour < 18;
              }).slice(0, 3);
              const body = `This is Amy, ${assistantEmail}'s assistant. Here are some of the available Meeting Slots. Let me know what works for you`;
              const formattedSlots = businessSlots.map(slot => {
                const start = new Date(slot.start);
                const end = new Date(slot.end);
                return `• ${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
              }).join('<br>');
              const htmlContent = `${body}<br><br>${formattedSlots}`;
              await this.composeAndSendEmail(
                toEmail,
                originalSubject,
                htmlContent,
                threadId,
                inReplyTo,
                originalRaw
              );
            } else {
              console.log('Could not determine sender email to reply with available slots. Headers:', headers);
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