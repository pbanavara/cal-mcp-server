import Anthropic from '@anthropic-ai/sdk';
import { MeetingRequestContext } from './gmail-monitor';
import { CalendarEvent } from './types';

export class MeetingIntentDetector {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env['ANTHROPIC_API_KEY'];
    if (!key) {
      throw new Error('Anthropic API key not provided. Set ANTHROPIC_API_KEY in your environment.');
    }
    this.anthropic = new Anthropic({ apiKey: key });
  }

  async checkIfMessageMeetingRelated(emailText: string, today: string, timeZone: string): Promise<Array<string>> {
    const prompt = `You are an intelligent assistant who can parse strings and check if they relate to meetings or not. 

Given the following email text: "${emailText}"
Date: ${today}
Timezone: ${timeZone}

Determine if this email is related to scheduling, confirming, canceling, or discussing meetings.

Respond with the parsed dates if the message is meeting-related, or an empty list if the messsage is not meeting-related. Convert all dates to user's timezone`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        temperature: 0,
        system: 'You are a meeting detection assistant. Respond only with "true" or "false".',
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const content = response.content?.find(block => block.type === 'text')?.text || '';
      const result = content.trim().toLowerCase();
      return result.split(',').map(date => date.trim());
    } catch (error) {
      console.error('Error checking if message is meeting-related:', error);
      // Default to false if there's an error
      return [];
    }
  }


  async getMeetingRequestContext(emailText: string, today: string, timeZone: string, busyEvents?: CalendarEvent[]): Promise<MeetingRequestContext> {
    // Build busy events section for the prompt
    let busyEventsSection = '';
    if (busyEvents && busyEvents.length > 0) {
      const formattedEvents = busyEvents.map(event => {
        // Parse the ISO time and format it nicely
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const date = start.toISOString().split('T')[0]; // YYYY-MM-DD
        const startTime = start.toTimeString().substring(0, 5); // HH:MM
        const endTime = end.toTimeString().substring(0, 5); // HH:MM
        const summary = event.summary || 'Busy';
        return `${date} ${startTime}-${endTime}: ${summary}`;
      }).join('\n');
      
      busyEventsSection = `\n\nBUSY TIME SLOTS (avoid these times):\n${formattedEvents}\n\nIMPORTANT: Do NOT schedule meetings during any of these busy times. Suggest alternative times that avoid conflicts.`;
      console.log('[For Claude API] Busy events section:', busyEventsSection);
    }

    const prompt = `You are a smart assistant that helps schedule meetings.\n\nGiven the following message:\n---\n"${emailText}"\n---\nin time zone: ${timeZone}\nAssume today's date is: ${today}${busyEventsSection}\n\nPlease perform the following:\n1. Classify the **meeting intent**: is the user confirming a time, requesting a time, proposing multiple times, cancelling, rescheduling, or being vague?\n2. Identify the **meeting type or context** if it's apparent: e.g., lunch, dinner, interview, sync, casual catch-up.\n3. Extract any preferred meeting windows (dates, days, time ranges) if mentioned.\n4. If a specific time is mentioned in the message AND it does NOT conflict with busy times, return that time.\n5. If the requested time conflicts with busy slots or no specific time is mentioned, recommend 2-3 alternative time slots during business hours (9 AM - 6 PM) that avoid all busy periods.\n6. Use the default meeting interval of 30 minutes for suggestions.\n7. Output all times in the same time zone the message came from.\n8. Return output in **strict JSON**, no markdown, no extra text, no code blocks.\n\nJSON format:\n{\n  "extracted_preferences": {\n    "date_range": ["2025-07-24"],\n    "preferred_days": ["Thursday"],\n    "preferred_time": "3:00 PM"\n  },\n  "suggested_meeting_times": [\n    {\n      "date": "2025-07-24",\n      "time_slots": ["15:00-15:30"],\n      "timezone": "-07:00"\n    }\n  ],\n  "meeting_context": {\n    "intent": "propose",\n    "meeting_type": "lunch",\n    "mentions_slots": true,\n    "user_action_required": "confirm"\n  },\n  "meeting_duration": "30 minutes",\n  "notes": "User proposed Monday 3 PM for lunch"\n}`;

    const model = 'claude-sonnet-4-20250514';
    try {
      console.log('[Claude API] Invoking with model:', model);
      console.log('[Claude API] Prompt:', prompt);
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1024,
        temperature: 0.2,
        system: 'You are a smart assistant that helps schedule meetings.',
        messages: [
          { role: 'user', content: prompt }
        ]
      });
      console.log('[Claude API] Raw response:', response);
      const content = response.content?.find(block => block.type === 'text')?.text || '';
      console.log('[Claude API] Extracted content:', content);
      try {
        // Remove markdown code block if present
        const cleaned = content.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned) as MeetingRequestContext;
      } catch (parseErr) {
        console.error('Failed to parse Claude response as JSON:', content, parseErr);
        throw parseErr;
      }
    } catch (err: any) {
      console.error('[Claude API] Error:', err?.response?.data || err);
      throw err;
    }
  }

  async generateEmailResponse(
    originalEmailText: string, 
    meetingContext: MeetingRequestContext,
    senderName?: string
  ): Promise<string> {
    // Format available slots for the prompt
    const availableSlots = meetingContext.suggested_meeting_times.flatMap(time => 
      time.time_slots.map(slot => {
        const [startTime] = slot.split('-');
        return `${time.date} at ${startTime}`;
      })
    );

    const senderInfo = senderName ? `to ${senderName}` : '';
    const meetingType = meetingContext.meeting_context?.meeting_type || 'meeting';
    const availableSlotsText = availableSlots.length > 0 
      ? availableSlots.slice(0, 3).map((slot, index) => `${index + 1}. ${slot}`).join('\n')
      : 'No immediate availability found';

    const prompt = `You are an AI assistant helping to respond to meeting requests. Generate a professional, well-formatted email response.

ORIGINAL EMAIL REQUEST:
"${originalEmailText}"

MEETING CONTEXT:
- Meeting Type: ${meetingType}
- Intent: ${meetingContext.meeting_context?.intent || 'unknown'}
- Notes: ${meetingContext.notes || 'No additional notes'}

AVAILABLE TIME SLOTS:
${availableSlotsText}

Please generate a professional email response ${senderInfo} that:
1. Thanks them for their meeting request
2. References the specific meeting type/context if relevant
3. Provides the available time slots in a clean, numbered format
4. Asks them to confirm or suggest alternatives
5. Uses proper email formatting with line breaks between paragraphs
6. Maintains a professional but friendly tone
7. Signs off appropriately as an AI assistant

If there are notes about why specific requested times aren't available, mention this diplomatically.

IMPORTANT FORMATTING REQUIREMENTS:
- Use \\n characters for line breaks between paragraphs
- Use \\n\\n for paragraph spacing
- Each major section should be separated by blank lines
- The numbered time slots should be on separate lines

Generate the email body ONLY (no subject line needed). Make sure to include proper \\n characters for line breaks.`;

    try {
      console.log('[Claude API] Generating email response...');
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.3,
        system: 'You are a professional AI assistant helping with meeting scheduling. Generate well-formatted email responses.',
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const content = response.content?.find(block => block.type === 'text')?.text || '';
      console.log('[Claude API] Email response generated');
      return content.trim();
    } catch (err) {
      console.error('[Claude API] Error generating email response:', err);
      // Fallback to a simple response if Claude fails
      return `Hi,\n\nThank you for your meeting request. I have some availability and will get back to you shortly with specific time options.\n\nBest regards,\nAI Assistant`;
    }
  }
} 