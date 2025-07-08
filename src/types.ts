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
  scope: string;
  token_type: string;
  expiry_date: number;
  user_email?: string;
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