import { DynamoDBTokenStorage, TokenStorageRecord } from './dynamodb-token-storage';
import { TokenData } from './types';

export interface TokenRecord {
  google_tokens: TokenData;
  user_email: string;
  created_at: string;
  updated_at: string;
}

export class TokenStorageService {
  private dynamoDBStorage: DynamoDBTokenStorage;

  constructor() {
    this.dynamoDBStorage = new DynamoDBTokenStorage();
  }

  async getTokens(jti: string): Promise<TokenRecord | null> {
    try {
      const tokenRecord = await this.dynamoDBStorage.getTokens(jti);
      if (tokenRecord) {
        return {
          google_tokens: {
            access_token: tokenRecord.google_tokens.access_token,
            refresh_token: tokenRecord.google_tokens.refresh_token,
            expiry_date: tokenRecord.google_tokens.expiry_date,
            scopes: tokenRecord.google_tokens.scopes || []
          },
          user_email: tokenRecord.email,
          created_at: tokenRecord.created_at,
          updated_at: tokenRecord.updated_at
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting tokens from DynamoDB:', error);
      return null;
    }
  }

  async putTokens(jti: string, tokenRecord: TokenRecord): Promise<void> {
    try {
      const dynamoRecord: TokenStorageRecord = {
        jti,
        user_id: tokenRecord.user_email, // Using email as user_id for simplicity
        email: tokenRecord.user_email,
        google_tokens: {
          access_token: tokenRecord.google_tokens.access_token,
          refresh_token: tokenRecord.google_tokens.refresh_token,
          expiry_date: tokenRecord.google_tokens.expiry_date,
          scopes: tokenRecord.google_tokens.scopes || []
        },
        created_at: tokenRecord.created_at,
        updated_at: tokenRecord.updated_at
      };

      await this.dynamoDBStorage.putTokens(dynamoRecord);
    } catch (error) {
      console.error('Error storing tokens in DynamoDB:', error);
      throw error;
    }
  }

  async getAllTokens(): Promise<TokenRecord[]> {
    try {
      const dynamoRecords = await this.dynamoDBStorage.getAllTokens();
      return dynamoRecords.map(record => ({
        google_tokens: {
          access_token: record.google_tokens.access_token,
          refresh_token: record.google_tokens.refresh_token,
          expiry_date: record.google_tokens.expiry_date,
          scopes: record.google_tokens.scopes || [],
          user_email: record.email,
          client_id: process.env['GOOGLE_CLIENT_ID'] || '',
          client_secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
          token_uri: 'https://oauth2.googleapis.com/token'
        },
        user_email: record.email,
        created_at: record.created_at,
        updated_at: record.updated_at
      }));
    } catch (error) {
      console.error('Error getting all tokens from DynamoDB:', error);
      return [];
    }
  }
}

export class TokenStorageConfig {
  private static instance: TokenStorageConfig;
  private storageService: TokenStorageService;

  private constructor() {
    this.storageService = new TokenStorageService();
  }

  public static getInstance(): TokenStorageConfig {
    if (!TokenStorageConfig.instance) {
      TokenStorageConfig.instance = new TokenStorageConfig();
    }
    return TokenStorageConfig.instance;
  }

  public getStorageService(): TokenStorageService {
    return this.storageService;
  }
}

// Export singleton instance
export const tokenStorageConfig = TokenStorageConfig.getInstance(); 