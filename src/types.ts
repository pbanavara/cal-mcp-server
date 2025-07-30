// Gmail API Types
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload?: GmailMessagePart;
  sizeEstimate: number;
}

// JWT Types
export interface JWTPayload {
  jti: string; // JWT ID
  email: string;
  name?: string;
  picture?: string;
  iat?: number; // Issued at
  exp?: number; // Expiration time
  sub?: string; // Subject
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: GmailMessageBody;
  parts?: GmailMessagePart[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessageBody {
  attachmentId?: string;
  size: number;
  data?: string;
}

export interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}

export interface GmailHistoryResponse {
  history: GmailHistory[];
  historyId: string;
  nextPageToken?: string;
}

export interface GmailHistory {
  id: string;
  messages?: GmailMessage[];
  messagesAdded?: GmailHistoryMessageAdded[];
  messagesDeleted?: GmailHistoryMessageDeleted[];
  labelsAdded?: GmailHistoryLabelAdded[];
  labelsRemoved?: GmailHistoryLabelRemoved[];
}

export interface GmailHistoryMessageAdded {
  message: GmailMessage;
}

export interface GmailHistoryMessageDeleted {
  message: GmailMessage;
}

export interface GmailHistoryLabelAdded {
  message: GmailMessage;
  labelIds: string[];
}

export interface GmailHistoryLabelRemoved {
  message: GmailMessage;
  labelIds: string[];
}

// MCP Types
export interface MCPNotification {
  type: 'email_received';
  data: {
    messageId: string;
    subject: string;
    sender: string;
    receivedAt: string;
    snippet: string;
  };
}

export interface MCPClient {
  id: string;
  connection: any; // WebSocket connection
  lastSeen: Date;
}

// Token Management
export interface TokenData {
  access_token: string;
  refresh_token: string;
  scope?: string;
  scopes?: string[];
  token_type?: string;
  expiry_date: number;
  user_email?: string;
  client_id?: string;
  client_secret?: string;
  token_uri?: string;
}

// Webhook Types
export interface GmailWebhookPayload {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

// Server Configuration
export interface ServerConfig {
  port: number;
  webhookPort: number;
  gmailWatchTopic: string;
  gmailWatchSubscription: string;
  tokenFilePath: string;
}

// Calendar API Types
export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

export interface FreeSlot {
  start: string; // ISO string
  end: string;   // ISO string
}

// MeetingRequestContext and MeetingSlotAvailabilityResponse for slot checking and prompt building
export interface MeetingRequestContext {
  extracted_preferences: {
    date_range: string[];
    preferred_days: string[];
    preferred_time: string;
  };
  suggested_meeting_times: Array<{
    date: string;
    time_slots: string[];
    timezone: string;
  }>;
  meeting_context: {
    intent: string;
    meeting_type: string;
    mentions_slots: boolean;
    user_action_required: string;
  };
  meeting_duration: string;
  notes: string;
}

export interface MeetingSlotAvailabilityResponse {
  request_object: MeetingRequestContext;
  available: boolean;
  available_slots: Array<{
    date: string;
    time_slot: string;
    timezone: string;
  }>;
}
