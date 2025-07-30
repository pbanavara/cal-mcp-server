import { google } from 'googleapis';
import { GmailMessage, MeetingRequestContext, MeetingSlotAvailabilityResponse } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';
import { CalendarMonitor } from './calendar-monitor';
import { MeetingIntentDetector } from './meeting-intent-detector';
import { simpleParser } from 'mailparser';
// import { DateTime } from 'luxon'; // Removed as we simplified to use Claude for recommendations

export type { MeetingRequestContext, MeetingSlotAvailabilityResponse };

// REMOVED: Complex buildMeetingReplyPrompt function - replaced with simple Claude-based approach
// The new approach uses MeetingIntentDetector.generateEmailResponse() which creates professional, well-formatted responses using Claude

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

  // REMOVED: Redundant checkIfMessageMeetingRelated method - now using MeetingIntentDetector directly

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
    let quotedTextForPlain = '';
    if (originalHtml) {
      quotedHtml = `<div style="border-left:3px solid #ccc; margin:20px 0 0 0; padding-left:15px; color:#666; font-size:0.9em;">${originalHtml}</div>`;
      quotedTextForPlain = originalText; // Use plain text version for text email
    } else if (originalText) {
      quotedTextForPlain = originalText.split('\n').map(line => `> ${line}`).join('\n');
      quotedHtml = `<div style="border-left:3px solid #ccc; margin:20px 0 0 0; padding-left:15px; color:#666; font-size:0.9em; white-space:pre-wrap;">${quotedTextForPlain.replace(/\n/g, '<br>')}</div>`;
    }
    
    // Compose HTML reply - convert \n to <br> tags for proper formatting
    const bodyWithBreaks = body.replace(/\n/g, '<br>');
    const htmlBody = `
      <div>${bodyWithBreaks}</div>
      ${quotedHtml ? `<br><hr style="border:none; border-top:1px solid #eee; margin:20px 0;">` + quotedHtml : ''}
    `;
    
    // Compose plain text reply
    const textBody = quotedTextForPlain ? `${body}\n\n--- Original Message ---\n${quotedTextForPlain}` : body;
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

  // SIMPLIFIED: Let Claude handle slot recommendations based on free slots
  public async checkMeetingSlotAvailability(
    meetingContext: MeetingRequestContext
  ): Promise<MeetingSlotAvailabilityResponse> {
    console.log('🔄 Getting free slots and letting Claude recommend meeting times...');
    
    const dates = meetingContext.suggested_meeting_times.map(s => s.date);
    const timeZone: string = (meetingContext.suggested_meeting_times[0]?.timezone) || '+00:00';
    await this.calendarMonitor.initialize();
    
    // Get actual free slots from calendar
    const freeSlots = await this.calendarMonitor.getActualFreeSlots(dates, timeZone);
    console.log(`📋 Found ${freeSlots.length} actual free slots`);
    
    // Re-run Claude with free slots included to get proper recommendations
    const emailText = `Meeting request for: ${meetingContext.meeting_context?.meeting_type || 'general meeting'}. 
Preferred time: ${meetingContext.extracted_preferences?.preferred_time || 'flexible'}.
User requirements: ${meetingContext.notes || 'No specific requirements'}.`;
    
    const today = new Date().toISOString().split('T')[0] || '';
    const safeTimeZone = (timeZone || '+00:00') as string;
    const updatedContext = await this.meetingIntentDetector.getMeetingRequestContext(
      emailText, 
      today, 
      safeTimeZone, 
      freeSlots
    );
    
    console.log('✅ Claude has recommended slots based on available free time');
    
    return {
      request_object: updatedContext,
      available: updatedContext.suggested_meeting_times.length > 0,
      available_slots: updatedContext.suggested_meeting_times.flatMap(time => 
        time.time_slots.map(slot => ({
          date: time.date,
          time_slot: slot,
          timezone: time.timezone || timeZone
        }))
      )
    };
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

        // SIMPLIFIED: Check if meeting-related and get Claude's smart recommendations
        const snippet = (fullMsg.data as GmailMessage).snippet || '';
        const defaultTimeZone = '+00:00';
        const today = new Date().toISOString().slice(0, 10);
        
        try {
          console.log('📧 Checking if message is meeting-related...');
          const isMeetingRelated = await this.meetingIntentDetector.checkIfMessageMeetingRelated(snippet, today, defaultTimeZone);
          if (!isMeetingRelated) {
            console.log('❌ Message is not meeting related, no response needed');
            // Mark as read even if not meeting-related to avoid reprocessing
            try {
              await this.gmail!.users.messages.modify({
                userId: 'me',
                id: msg.id!,
                requestBody: {
                  removeLabelIds: ['UNREAD']
                }
              });
              console.log('✅ Non-meeting email marked as read');
            } catch (markReadErr) {
              console.error('⚠️ Failed to mark non-meeting email as read:', markReadErr);
            }
            continue;
          }
          
          console.log('✅ Meeting-related message detected, getting Claude recommendations...');
          
          // Get calendar free slots
          await this.calendarMonitor.initialize();
          const dates = [today]; // For now, check today's availability
          const freeSlots = await this.calendarMonitor.getActualFreeSlots(dates, defaultTimeZone);
          
          // Get Claude's smart recommendations based on free slots
          const smartRecommendations = await this.meetingIntentDetector.getMeetingRequestContext(
            snippet, 
            today, 
            defaultTimeZone, 
            freeSlots
          );
          
          console.log('🎯 Claude recommendations:', smartRecommendations);
          
          // Extract email info for reply
          const headers = (fullMsg.data as GmailMessage).payload?.headers || [];
          const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
          const toEmail = fromHeader ? fromHeader.value.replace(/.*<(.+)>/, '$1').trim() : '';
          const senderName = fromHeader ? 
            fromHeader.value.replace(/<.*>/, '').replace(/['"]/g, '').trim() : '';
          const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
          const originalSubject = subjectHeader ? 
            (subjectHeader.value.startsWith('Re:') ? subjectHeader.value : `Re: ${subjectHeader.value}`) : 
            'Re: Meeting Request';
          
          if (toEmail) {
            // Generate professional email response using Claude
            const replyBody = await this.meetingIntentDetector.generateEmailResponse(
              snippet, 
              smartRecommendations, 
              senderName
            );
            
            // Get the full raw message for proper threading
            let rawMessage = '';
            try {
              const rawMsg = await this.gmail!.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'raw'
              });
              rawMessage = rawMsg.data.raw || '';
            } catch (rawErr) {
              console.warn('Could not fetch raw message for threading:', rawErr);
            }
            
            await this.composeAndSendEmail(
              toEmail,
              originalSubject,
              replyBody,
              (fullMsg.data as GmailMessage).threadId,
              headers.find(h => h.name.toLowerCase() === 'message-id')?.value,
              rawMessage
            );
            console.log('📤 Smart meeting reply sent!');
          } else {
            console.log('❌ Could not determine sender email');
          }
          
          // Mark the meeting-related email as read after processing (regardless of reply success)
          try {
            await this.gmail!.users.messages.modify({
              userId: 'me',
              id: msg.id!,
              requestBody: {
                removeLabelIds: ['UNREAD']
              }
            });
            console.log('✅ Meeting email marked as read');
          } catch (markReadErr) {
            console.error('⚠️ Failed to mark meeting email as read:', markReadErr);
          }
        } catch (err) {
          console.error('❌ Error processing meeting message:', err);
          continue;
        }
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
      }
      return newMessages;
    } catch (err) {
      console.error('Error in checkForNewMessages:', err);
      return [];
    }
  }
} 