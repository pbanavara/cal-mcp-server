import { GmailMonitor, MeetingRequestContext, MeetingSlotAvailabilityResponse, buildMeetingReplyPrompt } from '../src/gmail-monitor';
import { CalendarMonitor } from '../src/calendar-monitor';
import { MeetingIntentDetector } from '../src/meeting-intent-detector';

jest.mock('../src/calendar-monitor');
jest.mock('../src/meeting-intent-detector');

const mockGmailApi = {
  users: {
    messages: {
      list: jest.fn(),
      get: jest.fn(),
      send: jest.fn(),
      modify: jest.fn(),
    },
  },
};

const mockOnMessageReceived = jest.fn();

// Helper to create a fake Gmail message
function createFakeGmailMessage(id: any, from: any, snippet: any) {
  snippet = snippet || 'meeting';
  return {
    id,
    threadId: 't1',
    labelIds: ['INBOX'],
    snippet,
    historyId: 'h1',
    internalDate: Date.now().toString(),
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: 'Test subject' },
        { name: 'Message-ID', value: 'msgid-123' },
      ],
      body: { size: 0 },
    },
    sizeEstimate: 1000,
  };
}

describe('GmailMonitor', () => {
  let gmailMonitor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock MeetingIntentDetector to return a deterministic MeetingRequestContext
    (MeetingIntentDetector as any).mockImplementation(() => {
      return {
        checkIfMessageMeetingRelated: jest.fn().mockResolvedValue({
          extracted_preferences: {
            date_range: ['2025-07-23', '2025-07-22'],
            preferred_days: ['Wednesday', 'Tuesday'],
            preferred_time: '10:00 AM',
          },
          suggested_meeting_times: [
            {
              date: '2025-07-23',
              time_slots: ['09:00-09:30', '10:00-10:30'],
              timezone: '+08:00',
            },
            {
              date: '2025-07-22',
              time_slots: ['11:00-11:30'],
              timezone: '+08:00',
            },
          ],
          meeting_context: {
            intent: 'propose',
            meeting_type: 'sync',
            mentions_slots: true,
            user_action_required: 'confirm',
          },
          meeting_duration: '30 minutes',
          notes: 'User proposed two dates for a sync meeting',
        })
      };
    });
    gmailMonitor = new GmailMonitor(mockOnMessageReceived);
    // @ts-ignore
    gmailMonitor.gmail = mockGmailApi;
    // @ts-ignore
    gmailMonitor.calendarMonitor = new CalendarMonitor();
    // @ts-ignore
    gmailMonitor.calendarMonitor.initialize = jest.fn().mockResolvedValue(true);
    // @ts-ignore
    gmailMonitor.calendarMonitor.getFreeSlotsForDates = jest.fn().mockResolvedValue([
      { start: '2025-07-23T09:00:00Z', end: '2025-07-23T09:30:00Z' },
    ]);
  });

  it('checkIfMessageMeetingRelated returns expected MeetingRequestContext structure', async () => {
    // @ts-ignore
    const result = await gmailMonitor.checkIfMessageMeetingRelated('meeting', '+08:00');
    expect(result).toHaveProperty('extracted_preferences');
    expect(result).toHaveProperty('suggested_meeting_times');
    expect(result).toHaveProperty('meeting_context');
    expect(result).toHaveProperty('meeting_duration');
    expect(result).toHaveProperty('notes');
    expect(Array.isArray(result.suggested_meeting_times)).toBe(true);
    expect(result.suggested_meeting_times[0]).toHaveProperty('date');
    expect(result.suggested_meeting_times[0]).toHaveProperty('time_slots');
    expect(result.suggested_meeting_times[0]).toHaveProperty('timezone');
    expect(result.meeting_context.intent).toBe('propose');
  });

  it('composeAndSendEmail formats and sends email', async () => {
    const to = 'test@example.com';
    const subject = 'Test Subject';
    const body = 'Test Body';
    // @ts-ignore
    await gmailMonitor.composeAndSendEmail(to, subject, body);
    expect(mockGmailApi.users.messages.send).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        requestBody: expect.objectContaining({ raw: expect.any(String) }),
      })
    );
  });

  it('pollUnreadMessages detects meeting, checks calendar, and sends email', async () => {
    // Mock Gmail API responses
    mockGmailApi.users.messages.list.mockResolvedValue({ data: { messages: [{ id: '1' }] } });
    mockGmailApi.users.messages.get.mockResolvedValue({ data: createFakeGmailMessage('1', 'Sender <sender@example.com>', 'meeting') });
    mockGmailApi.users.messages.send.mockResolvedValue({});

    // @ts-ignore
    gmailMonitor.seenMessageIds.clear();
    // @ts-ignore
    await gmailMonitor.pollUnreadMessages();

    // Should call meeting detection, calendar lookup, and send email
    expect(mockGmailApi.users.messages.send).toHaveBeenCalled();
    expect(gmailMonitor.calendarMonitor.getFreeSlotsForDates).toHaveBeenCalledWith(
      ['2025-07-23', '2025-07-22'],
      '+08:00'
    );
  });
});

describe('Meeting Slot Availability and Prompt', () => {
  let gmailMonitor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    gmailMonitor = new GmailMonitor(mockOnMessageReceived);
    // @ts-ignore
    gmailMonitor.gmail = mockGmailApi;
    // @ts-ignore
    gmailMonitor.calendarMonitor = new CalendarMonitor();
    // @ts-ignore
    gmailMonitor.calendarMonitor.initialize = jest.fn().mockResolvedValue(true);
    // @ts-ignore
    gmailMonitor.calendarMonitor.getBusyEvents = jest.fn().mockResolvedValue([]);
    // @ts-ignore
    gmailMonitor.calendarMonitor.getFreeSlotsForDates = jest.fn().mockResolvedValue([
      { start: '2025-07-25T14:00:00-07:00', end: '2025-07-25T14:30:00-07:00' },
      { start: '2025-07-26T11:00:00-07:00', end: '2025-07-26T11:30:00-07:00' },
    ]);
  });

  it('returns available=true when all requested slots are free', async () => {
    const meetingContext: MeetingRequestContext = {
      extracted_preferences: {
        date_range: ['2025-07-25'],
        preferred_days: ['Friday'],
        preferred_time: '2:00 PM',
      },
      suggested_meeting_times: [
        {
          date: '2025-07-25',
          time_slots: ['14:00-14:30'],
          timezone: '-07:00',
        },
      ],
      meeting_context: {
        intent: 'propose',
        meeting_type: 'lunch',
        mentions_slots: true,
        user_action_required: 'confirm',
      },
      meeting_duration: '30 minutes',
      notes: 'User proposed Friday 2 PM for lunch',
    };
    const resp: MeetingSlotAvailabilityResponse = await gmailMonitor.checkMeetingSlotAvailability(meetingContext);
    expect(resp.available).toBe(true);
    expect(resp.available_slots.length).toBe(1);
    expect(resp.available_slots[0]).toBeDefined();
    if (resp.available_slots[0]) {
      expect(resp.available_slots[0].date).toBe('2025-07-25');
    }
  });

  it('returns available=false and suggests alternatives when slot is busy', async () => {
    // Simulate a busy event that overlaps
    // @ts-ignore
    gmailMonitor.calendarMonitor.getBusyEvents = jest.fn().mockResolvedValue([
      {
        start: { dateTime: '2025-07-25T14:00:00-07:00' },
        end: { dateTime: '2025-07-25T14:30:00-07:00' },
      },
    ]);
    const meetingContext: MeetingRequestContext = {
      extracted_preferences: {
        date_range: ['2025-07-25'],
        preferred_days: ['Friday'],
        preferred_time: '2:00 PM',
      },
      suggested_meeting_times: [
        {
          date: '2025-07-25',
          time_slots: ['14:00-14:30'],
          timezone: '-07:00',
        },
      ],
      meeting_context: {
        intent: 'propose',
        meeting_type: 'lunch',
        mentions_slots: true,
        user_action_required: 'confirm',
      },
      meeting_duration: '30 minutes',
      notes: 'User proposed Friday 2 PM for lunch',
    };
    // @ts-ignore
    gmailMonitor.calendarMonitor.getFreeSlotsForDates = jest.fn().mockResolvedValue([
      { start: '2025-07-26T11:00:00-07:00', end: '2025-07-26T11:30:00-07:00' },
      { start: '2025-07-27T15:00:00-07:00', end: '2025-07-27T15:30:00-07:00' },
    ]);
    const resp: MeetingSlotAvailabilityResponse = await gmailMonitor.checkMeetingSlotAvailability(meetingContext);
    expect(resp.available).toBe(false);
    expect(resp.available_slots.length).toBeGreaterThan(0);
    expect(resp.available_slots[0]).toBeDefined();
    if (resp.available_slots[0]) {
      expect(resp.available_slots[0].date).toBe('2025-07-26');
    }
  });

  it('builds a natural language reply for available slot', () => {
    const resp: MeetingSlotAvailabilityResponse = {
      request_object: {
        extracted_preferences: {
          date_range: ['2025-07-25'],
          preferred_days: ['Friday'],
          preferred_time: '2:00 PM',
        },
        suggested_meeting_times: [
          {
            date: '2025-07-25',
            time_slots: ['14:00-14:30'],
            timezone: '-07:00',
          },
        ],
        meeting_context: {
          intent: 'propose',
          meeting_type: 'lunch',
          mentions_slots: true,
          user_action_required: 'confirm',
        },
        meeting_duration: '30 minutes',
        notes: 'User proposed Friday 2 PM for lunch',
      },
      available: true,
      available_slots: [
        { date: '2025-07-25', time_slot: '14:00-14:30', timezone: '-07:00' },
      ],
    };
    const body = buildMeetingReplyPrompt(resp, 'Friday 2 PM works for me.');
    expect(body).toMatch(/Great news/);
    expect(body).toMatch(/2025-07-25/);
    expect(body).toMatch(/2:00/);
  });

  it('builds a natural language reply for unavailable slot with alternatives', () => {
    const resp: MeetingSlotAvailabilityResponse = {
      request_object: {
        extracted_preferences: {
          date_range: ['2025-07-25'],
          preferred_days: ['Friday'],
          preferred_time: '2:00 PM',
        },
        suggested_meeting_times: [
          {
            date: '2025-07-25',
            time_slots: ['14:00-14:30'],
            timezone: '-07:00',
          },
        ],
        meeting_context: {
          intent: 'propose',
          meeting_type: 'lunch',
          mentions_slots: true,
          user_action_required: 'confirm',
        },
        meeting_duration: '30 minutes',
        notes: 'User proposed Friday 2 PM for lunch',
      },
      available: false,
      available_slots: [
        { date: '2025-07-26', time_slot: '11:00-11:30', timezone: '-07:00' },
        { date: '2025-07-27', time_slot: '15:00-15:30', timezone: '-07:00' },
      ],
    };
    const body = buildMeetingReplyPrompt(resp, 'Friday 2 PM works for me.');
    expect(body).toMatch(/no longer available/);
    expect(body).toMatch(/2025-07-26/);
    expect(body).toMatch(/11:00/);
  });
}); 