import Anthropic from '@anthropic-ai/sdk';
import { MeetingInfo } from './types';

export class MeetingIntentDetector {
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env['ANTHROPIC_API_KEY'];
    if (!key) {
      throw new Error('Anthropic API key not provided. Set ANTHROPIC_API_KEY in your environment.');
    }
    this.anthropic = new Anthropic({ apiKey: key });
  }

  async checkIfMessageMeetingRelated(emailText: string, today: string, timeZone: string): Promise<MeetingInfo> {
    const prompt = `You are a smart assistant that helps schedule meetings.\n\nGiven the following message:\n---\n"${emailText}"\n---\n\n "in" ${timeZone} "\n---\n\n" 1. Understand the context of the email. For ex: lunch, dinner and suggest times based on the context and event. 2. Extract any preferred meeting windows (dates, days, time ranges).\n 3. Assume today's date is ${today}.\n3. Assume default meeting interval 30 mins\n4. Return a date range or a time range as an array\n5. Output should be in JSON\n6. Respond in the same time zone the request is coming from\n7. Respond ONLY with a valid JSON object, no markdown, no explanation, no code block.\n\nExample JSON format:\n{\n  \"extracted_preferences\": {\n    \"date_range\": [\"2025-07-24\"],\n    \"preferred_days\": [\"Thursday\"],\n    \"preferred_time\": \"Not specified\"\n  },\n  \"suggested_meeting_times\": [\n    {\n      \"date\": \"2025-07-24\",\n      \"time_slots\": [\"09:00-09:30\", \"09:30-10:00\"],\n      \"timezone\": \"+00:00\"\n    }\n  ],\n  \"meeting_duration\": \"30 minutes\",\n  \"notes\": \"No specific time mentioned, suggesting common business hours slots\"\n}`;

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
        return JSON.parse(cleaned) as MeetingInfo;
      } catch (parseErr) {
        console.error('Failed to parse Claude response as JSON:', content, parseErr);
        throw parseErr;
      }
    } catch (err: any) {
      console.error('[Claude API] Error:', err?.response?.data || err);
      throw err;
    }
  }
} 