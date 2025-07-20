import { TokenData } from './types';
import { DynamoDBTokenStorage } from './dynamodb-token-storage';
import { google } from 'googleapis';

export class TokenManager {
  private static instance: TokenManager;
  private tokens: Map<string, TokenData> = new Map();
  private dynamoDBStorage: DynamoDBTokenStorage;
  private isInitialized: boolean = false;
  private refreshInProgress: Map<string, Promise<TokenData | null>> = new Map();

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
    
    let token: TokenData | undefined;
    if (email) {
      token = this.tokens.get(email);
    } else {
      // Return first available token
      token = this.tokens.values().next().value;
    }

    if (!token) {
      return undefined;
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    if (this.isTokenExpired(token) || this.isTokenExpiringSoon(token)) {
      console.log(`🔄 Token for ${token.user_email} is expired or expiring soon, refreshing...`);
      const refreshedToken = await this.refreshToken(token);
      if (refreshedToken) {
        return refreshedToken;
      } else {
        console.error(`❌ Failed to refresh token for ${token.user_email}`);
        return undefined;
      }
    }

    return token;
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

  public isTokenExpiringSoon(token: TokenData, bufferMinutes: number = 5): boolean {
    const bufferMs = bufferMinutes * 60 * 1000;
    return Date.now() >= (token.expiry_date - bufferMs);
  }

  /**
   * Refresh a token using Google's OAuth2 API
   */
  public async refreshToken(token: TokenData): Promise<TokenData | null> {
    const userEmail = token.user_email || 'unknown';
    
    // Prevent multiple simultaneous refresh attempts for the same user
    if (this.refreshInProgress.has(userEmail)) {
      console.log(`⏳ Token refresh already in progress for ${userEmail}, waiting...`);
      const existingPromise = this.refreshInProgress.get(userEmail);
      return existingPromise || null;
    }

    const refreshPromise = this.performTokenRefresh(token);
    this.refreshInProgress.set(userEmail, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.refreshInProgress.delete(userEmail);
    }
  }

  private async performTokenRefresh(token: TokenData): Promise<TokenData | null> {
    try {
      console.log(`🔄 Refreshing token for ${token.user_email}...`);
      
      const oauth2Client = new google.auth.OAuth2(
        token.client_id,
        token.client_secret,
        token.token_uri
      );

      // Set the refresh token
      oauth2Client.setCredentials({
        refresh_token: token.refresh_token
      });

      // Request new access token
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token || !credentials.expiry_date) {
        console.error('❌ Invalid credentials received from Google');
        return null;
      }

      // Create updated token data
      const updatedToken: TokenData = {
        ...token,
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date,
        scope: credentials.scope || token.scope || '',
        token_type: credentials.token_type || 'Bearer'
      };

      // Update in DynamoDB
      await this.updateTokenInDynamoDB(updatedToken);
      
      // Update in memory
      this.tokens.set(token.user_email!, updatedToken);
      
      console.log(`✅ Successfully refreshed token for ${token.user_email}`);
      return updatedToken;

    } catch (error) {
      console.error(`❌ Error refreshing token for ${token.user_email}:`, error);
      
      // If refresh token is invalid, remove from storage
      const errorObj = error as any;
      if (errorObj.code === 400 && errorObj.message?.includes('invalid_grant')) {
        console.log(`🗑️ Removing invalid refresh token for ${token.user_email}`);
        await this.removeToken(token.user_email!);
      }
      
      return null;
    }
  }

  /**
   * Update token in DynamoDB
   */
  private async updateTokenInDynamoDB(token: TokenData): Promise<void> {
    try {
      const tokenRecords = await this.dynamoDBStorage.getTokensByEmail(token.user_email!);
      if (!tokenRecords || tokenRecords.length === 0) {
        console.error(`❌ Token record not found for ${token.user_email}`);
        return;
      }

      // Update all tokens for this email (usually just one)
      for (const tokenRecord of tokenRecords) {
        const updatedRecord = {
          ...tokenRecord,
          google_tokens: {
            ...tokenRecord.google_tokens,
            access_token: token.access_token,
            expiry_date: token.expiry_date,
            scope: token.scope,
            token_type: token.token_type
          }
        };

        await this.dynamoDBStorage.updateTokens(updatedRecord);
      }
      
      console.log(`✅ Updated token in DynamoDB for ${token.user_email}`);
    } catch (error) {
      console.error(`❌ Error updating token in DynamoDB for ${token.user_email}:`, error);
      throw error;
    }
  }

  /**
   * Remove token from storage (when refresh token is invalid)
   */
  private async removeToken(userEmail: string): Promise<void> {
    try {
      await this.dynamoDBStorage.deleteTokens(userEmail);
      this.tokens.delete(userEmail);
      console.log(`🗑️ Removed invalid token for ${userEmail}`);
    } catch (error) {
      console.error(`❌ Error removing token for ${userEmail}:`, error);
    }
  }

  /**
   * Refresh all tokens that are expired or expiring soon
   */
  public async refreshAllTokens(): Promise<void> {
    console.log('🔄 Refreshing all tokens...');
    
    const tokensToRefresh: TokenData[] = [];
    
    for (const token of this.tokens.values()) {
      if (this.isTokenExpired(token) || this.isTokenExpiringSoon(token)) {
        tokensToRefresh.push(token);
      }
    }

    console.log(`📋 Found ${tokensToRefresh.length} tokens to refresh`);

    const refreshPromises = tokensToRefresh.map(token => 
      this.refreshToken(token).catch(error => {
        console.error(`❌ Failed to refresh token for ${token.user_email}:`, error);
        return null;
      })
    );

    await Promise.all(refreshPromises);
    console.log('✅ Finished refreshing all tokens');
  }

  /**
   * Set up automatic token refresh (call this periodically)
   */
  public async setupAutomaticRefresh(): Promise<void> {
    // Refresh tokens every 12 hours (before they expire)
    setInterval(async () => {
      try {
        await this.refreshAllTokens();
      } catch (error) {
        console.error('❌ Error in automatic token refresh:', error);
      }
    }, 12 * 60 * 60 * 1000); // 12 hours

    console.log('⏰ Automatic token refresh scheduled every 12 hours');
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