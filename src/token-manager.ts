import fs from 'fs';
import { TokenData } from './types';

interface JWTTokenRecord {
  jti: string;
  user_id: string;
  email: string;
  name: string;
  google_tokens: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    scopes: string[];
  };
  created_at: string;
  updated_at: string;
}

interface JWTTokenFile {
  [jti: string]: JWTTokenRecord;
}

export class TokenManager {
  private static instance: TokenManager;
  private tokens: Map<string, TokenData> = new Map();
  private tokenFilePath: string;

  private constructor() {
    // Path to the web app's JWT token storage
    this.tokenFilePath = '/Users/pbanavara/dev/mcp_email_agent/mcp-webapp/tokens/jwt_tokens.json';
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
        const jwtTokenData: JWTTokenFile = JSON.parse(data);
        
        // Convert JWT token format to TokenData format
        Object.values(jwtTokenData).forEach((jwtRecord) => {
          const tokenData: TokenData = {
            access_token: jwtRecord.google_tokens.access_token,
            refresh_token: jwtRecord.google_tokens.refresh_token,
            expiry_date: jwtRecord.google_tokens.expiry_date,
            scopes: jwtRecord.google_tokens.scopes,
            user_email: jwtRecord.email,
            client_id: process.env['GOOGLE_CLIENT_ID'] || '',
            client_secret: process.env['GOOGLE_CLIENT_SECRET'] || '',
            token_uri: 'https://oauth2.googleapis.com/token'
          };
          
          this.tokens.set(jwtRecord.email, tokenData);
        });
        
        console.error(`Loaded ${this.tokens.size} token(s) from JWT storage`);
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

  public hasTokens(): boolean {
    return this.tokens.size > 0;
  }

  public getTokenCount(): number {
    return this.tokens.size;
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
}

export const tokenManager = TokenManager.getInstance(); 