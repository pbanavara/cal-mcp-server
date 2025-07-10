import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { tokenStorageConfig } from './token-storage-config';
import { JWTPayload } from './types';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  googleTokens?: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    scopes: string[];
  };
}

export class JWTAuthMiddleware {
  private readonly secret: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-key';
  }

  /**
   * Middleware to authenticate JWT tokens
   */
  public authenticateJWT = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Get JWT from Authorization header or environment variable
      const authHeader = req.headers.authorization;
      const jwtToken = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : process.env.REKURA_JWT_TOKEN;

      if (!jwtToken) {
        return res.status(401).json({ 
          error: 'Missing JWT token',
          message: 'Please provide JWT token in Authorization header or REKURA_JWT_TOKEN environment variable'
        });
      }

      // Verify JWT
      const decoded = jwt.verify(jwtToken, this.secret) as JWTPayload;
      
      if (!decoded.jti) {
        return res.status(401).json({ 
          error: 'Invalid JWT token',
          message: 'JWT token missing JTI (JWT ID)'
        });
      }

      // Fetch Google tokens from storage
      const storageService = tokenStorageConfig.getStorageService();
      const tokenRecord = await storageService.getTokens(decoded.jti);

      if (!tokenRecord) {
        return res.status(401).json({ 
          error: 'Tokens not found',
          message: 'Google tokens not found for this JWT. Please re-authenticate in the web app.'
        });
      }

      // Check if Google tokens are expired
      if (Date.now() >= tokenRecord.google_tokens.expiry_date) {
        return res.status(401).json({ 
          error: 'Google tokens expired',
          message: 'Google OAuth tokens have expired. Please re-authenticate in the web app.'
        });
      }

      // Attach user and tokens to request
      req.user = decoded;
      req.googleTokens = tokenRecord.google_tokens;

      console.log(`✅ JWT authenticated for user: ${decoded.email} (JTI: ${decoded.jti})`);
      next();

    } catch (error) {
      console.error('JWT authentication failed:', error);
      
      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ 
          error: 'Invalid JWT token',
          message: 'JWT token is invalid or expired'
        });
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ 
          error: 'JWT token expired',
          message: 'JWT token has expired. Please re-authenticate in the web app.'
        });
      }

      return res.status(500).json({ 
        error: 'Authentication error',
        message: 'Internal server error during authentication'
      });
    }
  };

  /**
   * Optional authentication - doesn't fail if no token provided
   */
  public optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const jwtToken = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : process.env.REKURA_JWT_TOKEN;

      if (!jwtToken) {
        // No token provided, continue without authentication
        return next();
      }

      // Try to authenticate, but don't fail if it doesn't work
      const decoded = jwt.verify(jwtToken, this.secret) as JWTPayload;
      
      if (decoded.jti) {
        const storageService = tokenStorageConfig.getStorageService();
        const tokenRecord = await storageService.getTokens(decoded.jti);

        if (tokenRecord && Date.now() < tokenRecord.google_tokens.expiry_date) {
          req.user = decoded;
          req.googleTokens = tokenRecord.google_tokens;
          console.log(`✅ Optional JWT authenticated for user: ${decoded.email}`);
        }
      }

      next();
    } catch (error) {
      // Authentication failed, but continue without it
      console.log('Optional JWT authentication failed, continuing without auth');
      next();
    }
  };

  /**
   * Get user info from JWT without fetching tokens
   */
  public getUserInfo = (jwtToken: string): JWTPayload | null => {
    try {
      const decoded = jwt.verify(jwtToken, this.secret) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  };

  /**
   * Validate JWT token format without fetching tokens
   */
  public validateToken = (jwtToken: string): boolean => {
    try {
      jwt.verify(jwtToken, this.secret);
      return true;
    } catch (error) {
      return false;
    }
  };
}

// Export singleton instance
export const jwtAuthMiddleware = new JWTAuthMiddleware(); 