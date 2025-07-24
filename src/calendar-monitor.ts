import { google } from 'googleapis';
import { CalendarEvent, FreeSlot } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';

export class CalendarMonitor {
  private calendar: any;

  public async initialize(): Promise<boolean> {
    const token = await tokenManager.getToken();
    if (!token) {
      console.error('No tokens available for Calendar monitoring');
      return false;
    }

    const oauth2Client = new google.auth.OAuth2(
      token.client_id,
      token.client_secret,
      token.token_uri
    );
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scope: token.scopes?.join(' ') || 'https://www.googleapis.com/auth/calendar.readonly',
      token_type: 'Bearer',
      expiry_date: token.expiry_date,
    });

    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return true;
  }

  /**
   * Get busy events for the next 2 days
   */
  public async getBusyEvents(): Promise<CalendarEvent[]> {
    if (!this.calendar) {
      console.error('Calendar client not initialized');
      return [];
    }
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      });
      return (res.data.items || []).map((item: any) => ({
        id: item.id,
        summary: item.summary || '',
        start: item.start,
        end: item.end,
      }));
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      return [];
    }
  }

  /**
   * Compute free slots for the given dates and timezone, default 9am-6pm, 30min slots
   */
  public async getFreeSlotsForDates(dates: string[], timeZone: string): Promise<FreeSlot[]> {
    console.log('Calendar monitor received dates:', dates);
    console.log('Calendar monitor received timezone:', timeZone);
    
    const events = await this.getBusyEvents();
    console.log('Busy events found:', events.length);
    
    const workingStartHour = 9;
    const workingEndHour = 18;
    const slotMinutes = 30;
    const slots: FreeSlot[] = [];

    // Build busy intervals
    const busyIntervals = events.map(e => ({
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    }));
    
    console.log('Busy intervals:', busyIntervals.map(b => ({ start: b.start.toISOString(), end: b.end.toISOString() })));

    for (const dateStr of dates) {
      // Create a date object for the given date
      // We'll work in local timezone for simplicity and consistency
      const day = new Date(dateStr + 'T00:00:00');
      
      if (isNaN(day.getTime())) {
        console.error(`Invalid date constructed from dateStr="${dateStr}"`);
        continue;
      }
      for (let hour = workingStartHour; hour < workingEndHour; hour++) {
        for (let min = 0; min < 60; min += slotMinutes) {
          const slotStart = new Date(day);
          slotStart.setHours(hour, min, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);
          // Check overlap with busy intervals
          const overlaps = busyIntervals.some(busy =>
            slotStart < busy.end && slotEnd > busy.start
          );
          if (!overlaps) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
            });
          }
        }
      }
    }
    // Sort by start time
    slots.sort((a, b) => a.start.localeCompare(b.start));
    return slots;
  }

  /**
   * Compute free slots for the next 2 days, default 9am-6pm, 30min slots
   */
  public async getFreeSlots(): Promise<FreeSlot[]> {
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const dates: string[] = [];
    for (let d = new Date(now); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().slice(0, 10));
    }
    return this.getFreeSlotsForDates(dates, '');
  }
} 