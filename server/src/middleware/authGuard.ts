import type { Request, Response, NextFunction, RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { EnvConfig } from '../config/env.js';
import { getEnv } from '../config/env.js';
import { AUTH_COOKIE_NAME } from '../utils/cookies.js';
import { verifyJwt } from '../utils/jwt.js';
import { Session } from '../models/Session.js';
import { AppError } from '../utils/AppError.js';
import '../types/express.d.js';

/**
 * Authentication Credential Extraction Policy:
 * 1. Primary Transport: HttpOnly cookie named 'token' (AUTH_COOKIE_NAME).
 *    Standard mechanism for browser-based interactive sessions with automatic CSRF protection.
 * 2. Fallback Transport: HTTP 'Authorization: Bearer <token>' header.
 *    Enables programmatic API access, CLI tools, and automated testing harnesses.
 * 3. Precedence & Conflict Resolution:
 *    When both an HttpOnly cookie and an Authorization header are present, the HttpOnly
 *    cookie takes absolute precedence. This guarantees that client-side script injection
 *    or tampered request headers cannot override an authentic browser session.
 */
export function extractAuthToken(req: Request): string | null {
  // 1. Primary: Check HttpOnly cookie
  if (
    req.cookies &&
    typeof req.cookies[AUTH_COOKIE_NAME] === 'string' &&
    req.cookies[AUTH_COOKIE_NAME].trim().length > 0
  ) {
    return req.cookies[AUTH_COOKIE_NAME].trim();
  }

  // 2. Fallback: Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken.length > 0) {
      return bearerToken;
    }
  }

  return null;
}

/**
 * Factory for creating an authentication guard middleware with injectable environment configuration.
 *
 * @param envConfig - Optional environment configuration override (defaults to active runtime env)
 * @returns Express request handler enforcing JWT validity and active MongoDB session state
 */
export function createAuthGuard(envConfig?: EnvConfig): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const env = envConfig ?? (req.app?.locals?.env as EnvConfig | undefined) ?? getEnv();

      // 1. Extract token according to extraction policy
      const token = extractAuthToken(req);
      if (!token) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication token required');
      }

      // 2. Cryptographically verify signature, algorithm, claims, and temporal expiry
      const decoded = verifyJwt(token, env.JWT_SECRET);

      // 3. Ensure sessionId is a valid MongoDB ObjectId format
      if (!mongoose.Types.ObjectId.isValid(decoded.sessionId)) {
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid session identifier in token');
      }

      // 4. Verify that session exists and is currently active (isValid === true) in MongoDB
      const activeSession = await Session.findOne({
        _id: decoded.sessionId,
        isValid: true,
      });

      if (!activeSession) {
        throw new AppError(401, 'SESSION_REVOKED', 'Session has been invalidated or logged out.');
      }

      // 5. Attach trusted user identity and session info to request context
      req.user = {
        sessionId: decoded.sessionId,
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      };

      next();
    } catch (err: unknown) {
      next(err);
    }
  };
}

/**
 * Default authentication guard middleware using active runtime environment.
 */
export const authGuard: RequestHandler = (req, res, next) => {
  createAuthGuard()(req, res, next);
};
