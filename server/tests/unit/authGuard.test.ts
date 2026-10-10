import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@queueflow/shared';
import { extractAuthToken, createAuthGuard } from '../../src/middleware/authGuard.js';
import { signJwt } from '../../src/utils/jwt.js';
import { Session } from '../../src/models/Session.js';
import { AppError } from '../../src/utils/AppError.js';
import type { EnvConfig } from '../../src/config/env.js';

describe('Authentication Guard (server/src/middleware/authGuard.ts)', () => {
  const testEnv: EnvConfig = {
    PORT: 5000,
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://localhost:27017/queueflow',
    JWT_SECRET: 'test_jwt_secret_key_minimum_32_characters_long_for_security',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  const validPayload = {
    userId: '670000000000000000000001',
    email: 'user@example.com',
    role: UserRole.CUSTOMER,
    sessionId: '670000000000000000000002',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractAuthToken (Extraction Policy & Precedence)', () => {
    it('should extract token from HttpOnly cookie when present', () => {
      const req = {
        cookies: { token: 'cookie.jwt.token' },
      } as unknown as Request;

      expect(extractAuthToken(req)).toBe('cookie.jwt.token');
    });

    it('should extract token from Authorization header fallback when no cookie is present', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Bearer bearer.jwt.token' },
      } as unknown as Request;

      expect(extractAuthToken(req)).toBe('bearer.jwt.token');
    });

    it('should prioritize HttpOnly cookie over Authorization header when both are provided', () => {
      const req = {
        cookies: { token: 'cookie.authoritative.token' },
        headers: { authorization: 'Bearer header.tampered.token' },
      } as unknown as Request;

      // Policy: Cookie takes precedence to prevent header hijacking of browser sessions
      expect(extractAuthToken(req)).toBe('cookie.authoritative.token');
    });

    it('should return null when neither cookie nor Bearer header is present', () => {
      const req = {
        cookies: {},
        headers: {},
      } as unknown as Request;

      expect(extractAuthToken(req)).toBeNull();
    });

    it('should return null for non-Bearer Authorization headers', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      } as unknown as Request;

      expect(extractAuthToken(req)).toBeNull();
    });
  });

  describe('createAuthGuard execution & verification', () => {
    it('should reject requests with missing token with 401 UNAUTHORIZED', async () => {
      const guard = createAuthGuard(testEnv);
      const req = { cookies: {}, headers: {} } as Request;
      const res = {} as Response;
      const next = vi.fn();

      await guard(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.message).toBe('Authentication token required');
    });

    it('should reject malformed or tampered token with 401 UNAUTHORIZED', async () => {
      const guard = createAuthGuard(testEnv);
      const req = {
        cookies: { token: 'tampered.jwt.payload' },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      await guard(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('should reject expired tokens with 401 TOKEN_EXPIRED', async () => {
      const expiredToken = jwt.sign(validPayload, testEnv.JWT_SECRET, {
        expiresIn: '-10s',
      });

      const guard = createAuthGuard(testEnv);
      const req = {
        cookies: { token: expiredToken },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      await guard(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject tokens with invalid sessionId ObjectId format with 401 UNAUTHORIZED', async () => {
      const invalidIdPayload = { ...validPayload, sessionId: 'not-an-objectid' };
      const token = signJwt(invalidIdPayload, testEnv.JWT_SECRET);

      const guard = createAuthGuard(testEnv);
      const req = {
        cookies: { token },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      await guard(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('should reject a valid token with 401 SESSION_REVOKED when MongoDB session is revoked (isValid: false) or missing', async () => {
      const token = signJwt(validPayload, testEnv.JWT_SECRET);

      // Mock MongoDB Session.findOne to return null (session revoked or TTL purged)
      vi.spyOn(Session, 'findOne').mockResolvedValue(null);

      const guard = createAuthGuard(testEnv);
      const req = {
        cookies: { token },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      await guard(req, res, next);

      expect(Session.findOne).toHaveBeenCalledWith({
        _id: validPayload.sessionId,
        isValid: true,
      });

      expect(next).toHaveBeenCalledOnce();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('SESSION_REVOKED');
      expect(err.message).toBe('Session has been invalidated or logged out.');
    });

    it('should successfully authenticate and populate req.user when token and MongoDB session are both valid', async () => {
      const token = signJwt(validPayload, testEnv.JWT_SECRET);

      // Mock MongoDB Session.findOne to return active session document
      vi.spyOn(Session, 'findOne').mockResolvedValue({
        _id: validPayload.sessionId,
        userId: validPayload.userId,
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000),
      } as never);

      const guard = createAuthGuard(testEnv);
      const req = {
        cookies: { token },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();

      await guard(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith(); // No error

      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe(validPayload.userId);
      expect(req.user?.email).toBe(validPayload.email);
      expect(req.user?.role).toBe(validPayload.role);
      expect(req.user?.sessionId).toBe(validPayload.sessionId);
    });
  });
});
