import { google } from 'googleapis';
import { CalendarEvent, FreeSlot } from './types';
import { tokenManager } from './token-manager';
import 'dotenv/config';
import { DateTime } from 'luxon';

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
   * Get busy events for the specified dates
   */
  public async getBusyEvents(requestedDates?: string[]): Promise<CalendarEvent[]> {
    if (!this.calendar) {
      console.error('Calendar client not initialized');
      return [];
    }
    
    let timeMin: Date;
    let timeMax: Date;
    
    if (requestedDates && requestedDates.length > 0) {
      // Use the requested date range
      const sortedDates = requestedDates.sort();
      timeMin = new Date(sortedDates[0] + 'T00:00:00Z');
      timeMax = new Date(sortedDates[sortedDates.length - 1] + 'T23:59:59Z');
    } else {
      // Fallback to 2 days from now
      const now = new Date();
      timeMin = now;
      timeMax = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    }
    
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
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
    
    const events = await this.getBusyEvents(dates);
    console.log('Busy events found:', events.length);
    
    const workingStartHour = 9;
    const workingEndHour = 18;
    const slotMinutes = 30;
    const slots: FreeSlot[] = [];

    // Build busy intervals using Luxon directly (no JS Date conversion)
    const busyIntervals = events.map(e => ({
      start: DateTime.fromISO(e.start.dateTime),
      end: DateTime.fromISO(e.end.dateTime),
    }));
    
    console.log('Busy intervals:', busyIntervals.map(b => ({ start: b.start.toISO(), end: b.end.toISO() })));

    for (const dateStr of dates) {
      // Create base date in the specified timezone using Luxon - much simpler!
      const baseDate = DateTime.fromISO(dateStr, { zone: timeZone });
      
      if (!baseDate.isValid) {
        console.error(`Invalid date constructed from dateStr="${dateStr}" in timezone="${timeZone}". Error: ${baseDate.invalidReason}`);
        continue;
      }

      for (let hour = workingStartHour; hour < workingEndHour; hour++) {
        for (let min = 0; min < 60; min += slotMinutes) {
          // Create slot times using Luxon - handles timezone automatically
          const slotStart = baseDate.set({ hour, minute: min, second: 0, millisecond: 0 });
          const slotEnd = slotStart.plus({ minutes: slotMinutes });
          
          // Convert to UTC for comparison with busy intervals
          const slotStartUTC = slotStart.toUTC();
          const slotEndUTC = slotEnd.toUTC();
          
          // Check overlap with busy intervals (already Luxon DateTime objects)
          const overlaps = busyIntervals.some(busy => {
            const busyStartUTC = busy.start.toUTC();
            const busyEndUTC = busy.end.toUTC();
            
            // Add buffer to prevent back-to-back meetings
            const busyStartWithBuffer = busyStartUTC.minus({ minutes: 5 });
            const busyEndWithBuffer = busyEndUTC.plus({ minutes: 5 });
            
            const hasOverlap = slotStartUTC < busyEndWithBuffer && slotEndUTC > busyStartWithBuffer;
            console.log(`🔍 Checking overlap: Slot ${slotStartUTC.toISO()}-${slotEndUTC.toISO()} vs Busy+buffer ${busyStartWithBuffer.toISO()}-${busyEndWithBuffer.toISO()} = ${hasOverlap}`);
            
            if (hasOverlap) {
              console.log(`🚫 CONFLICT: Slot conflicts with busy period (including 5min buffer)`);
            }
            
            return hasOverlap;
          });
          
          if (!overlaps) {
            slots.push({
              start: slotStart.toISO(),
              end: slotEnd.toISO(),
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
   * Get actual free time slots for given dates and timezone within business hours
   * This calculates gaps between busy events, which is more accurate than filtering all possible slots
   */
  public async getActualFreeSlots(dates: string[], timeZone: string): Promise<FreeSlot[]> {
    console.log('📅 Getting actual free slots for dates:', dates, 'in timezone:', timeZone);
    
    const events = await this.getBusyEvents(dates);
    const freeSlots: FreeSlot[] = [];
    
    const workingStartHour = 9;
    const workingEndHour = 18;
    const slotMinutes = 30;
    
    for (const dateStr of dates) {
      // Create business day boundaries in the specified timezone
      const dayStart = DateTime.fromISO(dateStr, { zone: timeZone }).set({ 
        hour: workingStartHour, minute: 0, second: 0, millisecond: 0 
      });
      const dayEnd = DateTime.fromISO(dateStr, { zone: timeZone }).set({ 
        hour: workingEndHour, minute: 0, second: 0, millisecond: 0 
      });
      
      // Get busy events for this specific date
      const dayBusyEvents = events
        .filter(event => {
          const eventStart = DateTime.fromISO(event.start.dateTime);
          return eventStart.toFormat('yyyy-MM-dd') === dateStr;
        })
        .map(event => ({
          start: DateTime.fromISO(event.start.dateTime),
          end: DateTime.fromISO(event.end.dateTime)
        }))
        .sort((a, b) => a.start.toMillis() - b.start.toMillis());
      
      console.log(`📊 Found ${dayBusyEvents.length} busy events for ${dateStr}`);
      
      // Find free slots as gaps between busy events
      let currentTime = dayStart;
      
      for (const busyEvent of dayBusyEvents) {
        // Add free slots before this busy event
        while (currentTime < busyEvent.start && currentTime < dayEnd) {
          const slotEnd = currentTime.plus({ minutes: slotMinutes });
          
          // Only add slot if it doesn't overlap with the busy event
          if (slotEnd <= busyEvent.start) {
            freeSlots.push({
              start: currentTime.toISO()!,
              end: slotEnd.toISO()!
            });
          }
          
          currentTime = currentTime.plus({ minutes: slotMinutes });
        }
        
        // Skip past the busy event
        currentTime = DateTime.max(currentTime, busyEvent.end);
      }
      
      // Add remaining free slots after all busy events until end of day
      while (currentTime < dayEnd) {
        const slotEnd = currentTime.plus({ minutes: slotMinutes });
        if (slotEnd <= dayEnd) {
          freeSlots.push({
            start: currentTime.toISO()!,
            end: slotEnd.toISO()!
          });
        }
        currentTime = currentTime.plus({ minutes: slotMinutes });
      }
    }
    
    console.log(`✅ Calculated ${freeSlots.length} actual free slots`);
    return freeSlots;
  }

} 