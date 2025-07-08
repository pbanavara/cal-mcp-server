import fs from 'fs';
import { TokenData } from './types';

export class TokenManager {
  private static instance: TokenManager;
  private tokens: Map<string, TokenData> = new Map();
  private tokenFilePath: string;

  private constructor() {
    // Path to the web app's token storage (updated for new structure)
    this.tokenFilePath = '/Users/pbanavara/dev/mcp_email_agent/mcp-webapp/tokens/mcp_tokens.json';
    console.error(`Token file: ${this.tokenFilePath}`);
    this.loadTokens();
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = fs.readFileSync(this.tokenFilePath, 'utf8');
        const tokenData = JSON.parse(data);
        
        // Support both map-of-emails and flat token formats
        if (typeof tokenData === 'object' && !Array.isArray(tokenData)) {
          if ('access_token' in tokenData || 'token' in tokenData) {
            // Flat Google token format
            this.tokens.set('default', tokenData as TokenData);
          } else {
            // Map of emails format
            Object.entries(tokenData).forEach(([email, token]) => {
              this.tokens.set(email, token as TokenData);
            });
          }
        }
        console.error(`Loaded ${this.tokens.size} token(s) from web app storage`);
      } else {
        console.error(`Token file not found at: ${this.tokenFilePath}`);
      }
    } catch (error) {
      console.error('Error loading tokens:', error);
    }
  }

  public getToken(email?: string): TokenData | undefined {
    if (email) {
      return this.tokens.get(email);
    }
    // Return first available token
    return this.tokens.values().next().value;
  }

  public getAllTokens(): TokenData[] {
    return Array.from(this.tokens.values());
  }

  public hasTokens(): boolean {
    return this.tokens.size > 0;
  }

  public isTokenExpired(token: TokenData): boolean {
    return Date.now() >= token.expiry_date;
  }

  public refreshTokens(): void {
    this.loadTokens();
  }

  public getTokenFile(): string {
    return this.tokenFilePath;
  }

  public getTokenCount(): number {
    return this.tokens.size;
  }
}

export const tokenManager = TokenManager.getInstance(); 