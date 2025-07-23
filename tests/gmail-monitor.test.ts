import { GmailMonitor } from '../src/gmail-monitor';
import { CalendarMonitor } from '../src/calendar-monitor';
// import { GmailMessage } from '../src/types'; // Unused

jest.mock('../src/calendar-monitor');

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

  it('checkIfMessageMeetingRelated returns expected mock structure', () => {
    // @ts-ignore
    const result = gmailMonitor.checkIfMessageMeetingRelated('meeting');
    expect(result).toEqual({
      message: 'meeting',
      meeting: 'yes',
      time: ['2025-07-23', '2025-07-22'],
      time_zone: '+08:00',
    });
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