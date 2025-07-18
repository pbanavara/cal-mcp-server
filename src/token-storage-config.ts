import { tokenManager } from './token-manager';
import { TokenData } from './types';

export interface TokenRecord {
  google_tokens: TokenData;
  user_email: string;
  created_at: string;
  updated_at: string;
}

export class TokenStorageService {
  async getTokens(_jti: string): Promise<TokenRecord | null> {
    try {
      // Use the existing token manager to get the first available token
      const tokenData = await tokenManager.getToken();
      if (tokenData) {
        return {
          google_tokens: tokenData,
          user_email: tokenData.user_email || 'unknown',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting tokens:', error);
      return null;
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