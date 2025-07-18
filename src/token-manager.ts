import { TokenData } from './types';
import { FirestoreTokenStorage } from './firestore-token-storage';

export class TokenManager {
  private static instance: TokenManager;
  private tokens: Map<string, TokenData> = new Map();
  private firestoreStorage: FirestoreTokenStorage;
  private isInitialized: boolean = false;

  private constructor() {
    this.firestoreStorage = new FirestoreTokenStorage();
    console.log('🔧 TokenManager constructor called');
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  private async loadTokensFromFirestore(): Promise<void> {
    try {
      console.log('🔧 Loading tokens from Firestore...');
      const allTokens = await this.firestoreStorage.getAllTokens();
      
      // Clear existing tokens
      this.tokens.clear();
      
      // Convert Firestore format to TokenData format
      allTokens.forEach((tokenRecord) => {
        const tokenData: TokenData = {
          access_token: tokenRecord.google_tokens.access_token,
          refresh_token: tokenRecord.google_tokens.refresh_token,
          expiry_date: tokenRecord.google_tokens.expiry_date,
          scopes: tokenRecord.google_tokens.scopes,
          user_email: tokenRecord.email,
          client_id: process.env['GOOGLE_CLIENT_ID'] || '',
          client_secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
          token_uri: 'https://oauth2.googleapis.com/token'
        };
        
        this.tokens.set(tokenRecord.email, tokenData);
      });
      
      console.log(`✅ Loaded ${this.tokens.size} token(s) from Firestore`);
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Error loading tokens from Firestore:', error);
      this.isInitialized = false;
    }
  }

  public async getToken(email?: string): Promise<TokenData | undefined> {
    if (!this.isInitialized) {
      await this.loadTokensFromFirestore();
    }
    
    if (email) {
      return this.tokens.get(email);
    }
    // Return first available token
    return this.tokens.values().next().value;
  }

  public async hasTokens(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.loadTokensFromFirestore();
    }
    return this.tokens.size > 0;
  }

  public async getTokenCount(): Promise<number> {
    if (!this.isInitialized) {
      await this.loadTokensFromFirestore();
    }
    return this.tokens.size;
  }

  public isTokenExpired(token: TokenData): boolean {
    return Date.now() >= token.expiry_date;
  }

  public async refreshTokens(): Promise<void> {
    await this.loadTokensFromFirestore();
  }

  public async getTokenByJTI(jti: string): Promise<TokenData | undefined> {
    try {
      const tokenRecord = await this.firestoreStorage.getTokens(jti);
      if (tokenRecord) {
        return {
          access_token: tokenRecord.google_tokens.access_token,
          refresh_token: tokenRecord.google_tokens.refresh_token,
          expiry_date: tokenRecord.google_tokens.expiry_date,
          scopes: tokenRecord.google_tokens.scopes,
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
    await this.firestoreStorage.cleanupExpiredTokens();
    // Reload tokens after cleanup
    await this.refreshTokens();
  }
}

export const tokenManager = TokenManager.getInstance(); 