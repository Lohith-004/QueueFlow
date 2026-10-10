import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { UserRole } from '@queueflow/shared';
import { signJwt, verifyJwt, JWT_EXPIRES_IN, type JwtUserPayload } from '../../src/utils/jwt.js';
import { AppError } from '../../src/utils/AppError.js';

describe('JWT Utilities (server/src/utils/jwt.ts)', () => {
  const testSecret = 'synthetic_test_secret_key_minimum_32_characters_long';
  const wrongSecret = 'another_synthetic_secret_key_minimum_32_chars_long';

  const validPayload: JwtUserPayload = {
    userId: '670000000000000000000001',
    email: 'testuser@queueflow.com',
    role: UserRole.CUSTOMER,
    sessionId: '670000000000000000000002',
  };

  it('should define JWT expiration as 24h', () => {
    expect(JWT_EXPIRES_IN).toBe('24h');
  });

  describe('signJwt & verifyJwt', () => {
    it('should successfully sign and verify a token with exact claims', () => {
      const token = signJwt(validPayload, testSecret);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const verified = verifyJwt(token, testSecret);
      expect(verified.userId).toBe(validPayload.userId);
      expect(verified.email).toBe(validPayload.email);
      expect(verified.role).toBe(validPayload.role);
      expect(verified.sessionId).toBe(validPayload.sessionId);
    });

    it('should set token expiration to 24 hours (86400 seconds)', () => {
      const token = signJwt(validPayload, testSecret);
      const decoded = jwt.decode(token) as { iat: number; exp: number };

      expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
    });

    it('should preserve STAFF and ADMIN roles accurately in token claims', () => {
      const staffToken = signJwt({ ...validPayload, role: UserRole.STAFF }, testSecret);
      const adminToken = signJwt({ ...validPayload, role: UserRole.ADMIN }, testSecret);

      expect(verifyJwt(staffToken, testSecret).role).toBe(UserRole.STAFF);
      expect(verifyJwt(adminToken, testSecret).role).toBe(UserRole.ADMIN);
    });
  });

  describe('Verification Failure Modes', () => {
    it('should map expired tokens to HTTP 401 with TOKEN_EXPIRED error code', () => {
      // Create a token expired 10 seconds ago
      const expiredToken = jwt.sign(
        {
          userId: validPayload.userId,
          email: validPayload.email,
          role: validPayload.role,
          sessionId: validPayload.sessionId,
        },
        testSecret,
        { expiresIn: '-10s' }
      );

      try {
        verifyJwt(expiredToken, testSecret);
        expect.unreachable('Should have thrown an AppError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('TOKEN_EXPIRED');
        expect(appErr.message).toBe('Authentication token has expired');
      }
    });

    it('should map invalid signature to HTTP 401 with UNAUTHORIZED error code', () => {
      const token = signJwt(validPayload, testSecret);

      try {
        verifyJwt(token, wrongSecret);
        expect.unreachable('Should have thrown an AppError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('UNAUTHORIZED');
        expect(appErr.message).toBe('Invalid authentication token');
      }
    });

    it('should reject malformed token strings with HTTP 401 UNAUTHORIZED', () => {
      const malformedTokens = [
        'not.a.valid.jwt',
        'randomMalformedString',
        '',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.payload',
      ];

      for (const token of malformedTokens) {
        expect(() => verifyJwt(token, testSecret)).toThrow(AppError);
        try {
          verifyJwt(token, testSecret);
        } catch (err: unknown) {
          const appErr = err as AppError;
          expect(appErr.statusCode).toBe(401);
          expect(appErr.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should reject tokens with missing or invalid claim structures', () => {
      // Token missing sessionId
      const tokenMissingSession = jwt.sign(
        { userId: 'u1', email: 'u1@test.com', role: UserRole.CUSTOMER },
        testSecret,
        { expiresIn: '1h' }
      );
      expect(() => verifyJwt(tokenMissingSession, testSecret)).toThrow(AppError);

      // Token with invalid role
      const tokenInvalidRole = jwt.sign(
        { userId: 'u1', email: 'u1@test.com', role: 'SUPER_ADMIN', sessionId: 's1' },
        testSecret,
        { expiresIn: '1h' }
      );
      expect(() => verifyJwt(tokenInvalidRole, testSecret)).toThrow(AppError);

      // Token with non-string userId
      const tokenInvalidUserId = jwt.sign(
        { userId: 12345, email: 'u1@test.com', role: UserRole.CUSTOMER, sessionId: 's1' },
        testSecret,
        { expiresIn: '1h' }
      );
      expect(() => verifyJwt(tokenInvalidUserId, testSecret)).toThrow(AppError);
    });

    it('should reject tokens signed with an unapproved algorithm to prevent algorithm confusion attacks', () => {
      // Sign with HS512 instead of approved HS256
      const tokenWithDifferentAlg = jwt.sign(
        {
          userId: validPayload.userId,
          email: validPayload.email,
          role: validPayload.role,
          sessionId: validPayload.sessionId,
        },
        testSecret,
        { algorithm: 'HS512', expiresIn: '1h' }
      );

      try {
        verifyJwt(tokenWithDifferentAlg, testSecret);
        expect.unreachable('Should have rejected token signed with unapproved algorithm');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('UNAUTHORIZED');
        expect(appErr.message).toBe('Invalid authentication token');
      }
    });
  });
});
