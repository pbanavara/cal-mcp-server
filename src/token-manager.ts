import fs from 'fs';
import path from 'path';
import { TokenData } from './types';

export class TokenManager {
  private static instance: TokenManager;
  private tokens: Map<string, TokenData> = new Map();
  private tokenFilePath: string;

  private constructor() {
    // Path to the web app's token storage (updated for new structure)
    this.tokenFilePath = path.join(process.cwd(), '..', 'mcp-webapp', 'tokens', 'mcp_tokens.json');
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
        
        // Convert to Map if it's an object
        if (typeof tokenData === 'object' && !Array.isArray(tokenData)) {
          Object.entries(tokenData).forEach(([email, token]) => {
            this.tokens.set(email, token as TokenData);
          });
        }
        console.log(`✅ Loaded ${this.tokens.size} token(s) from web app storage`);
      } else {
        console.log(`⚠️  Token file not found at: ${this.tokenFilePath}`);
      }
    } catch (error) {
      console.error('❌ Error loading tokens:', error);
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