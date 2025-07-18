import { TokenData } from './types';
import { DynamoDBTokenStorage } from './dynamodb-token-storage';

export class TokenManager {
  private static instance: TokenManager;
  private tokens: Map<string, TokenData> = new Map();
  private dynamoDBStorage: DynamoDBTokenStorage;
  private isInitialized: boolean = false;

  private constructor() {
    this.dynamoDBStorage = new DynamoDBTokenStorage();
    console.log('🔧 TokenManager constructor called');
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  private async loadTokensFromDynamoDB(): Promise<void> {
    try {
      console.log('🔧 Loading tokens from DynamoDB...');
      const allTokens = await this.dynamoDBStorage.getAllTokens();
      
      // Clear existing tokens
      this.tokens.clear();
      
      // Convert DynamoDB format to TokenData format
      allTokens.forEach((tokenRecord) => {
        const tokenData: TokenData = {
          access_token: tokenRecord.google_tokens.access_token,
          refresh_token: tokenRecord.google_tokens.refresh_token,
          expiry_date: tokenRecord.google_tokens.expiry_date,
          scopes: tokenRecord.google_tokens.scopes || [],
          user_email: tokenRecord.email,
          client_id: process.env['GOOGLE_CLIENT_ID'] || '',
          client_secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
          token_uri: 'https://oauth2.googleapis.com/token'
        };
        
        this.tokens.set(tokenRecord.email, tokenData);
      });
      
      console.log(`✅ Loaded ${this.tokens.size} token(s) from DynamoDB`);
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Error loading tokens from DynamoDB:', error);
      this.isInitialized = false;
    }
  }

  public async getToken(email?: string): Promise<TokenData | undefined> {
    if (!this.isInitialized) {
      await this.loadTokensFromDynamoDB();
    }
    
    if (email) {
      return this.tokens.get(email);
    }
    // Return first available token
    return this.tokens.values().next().value;
  }

  public async hasTokens(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.loadTokensFromDynamoDB();
    }
    return this.tokens.size > 0;
  }

  public async getTokenCount(): Promise<number> {
    if (!this.isInitialized) {
      await this.loadTokensFromDynamoDB();
    }
    return this.tokens.size;
  }

  public isTokenExpired(token: TokenData): boolean {
    return Date.now() >= token.expiry_date;
  }

  public async refreshTokens(): Promise<void> {
    await this.loadTokensFromDynamoDB();
  }

  public async getTokenByJTI(jti: string): Promise<TokenData | undefined> {
    try {
      const tokenRecord = await this.dynamoDBStorage.getTokens(jti);
      if (tokenRecord) {
        return {
          access_token: tokenRecord.google_tokens.access_token,
          refresh_token: tokenRecord.google_tokens.refresh_token,
          expiry_date: tokenRecord.google_tokens.expiry_date,
          scopes: tokenRecord.google_tokens.scopes || [],
          user_email: tokenRecord.email,
          client_id: process.env['GOOGLE_CLIENT_ID'] || '',
          client_secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
          token_uri: 'https://oauth2.googleapis.com/token'
        };
      }
      return undefined;
    } catch (error) {
      console.error('❌ Error getting token by JTI:', error);
      return undefined;
    }
  }

  public async cleanupExpiredTokens(): Promise<void> {
    await this.dynamoDBStorage.cleanupExpiredTokens();
    // Reload tokens after cleanup
    await this.refreshTokens();
  }
}

export const tokenManager = TokenManager.getInstance(); 