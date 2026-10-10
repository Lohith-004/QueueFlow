import jwt from 'jsonwebtoken';
import { UserRole } from '@queueflow/shared';
import { AppError } from './AppError.js';

export interface JwtUserPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export const JWT_EXPIRES_IN = '24h';
export const JWT_ALGORITHM = 'HS256';

/**
 * Signs a JSON Web Token with standard user identity claims and server-side session ID.
 * Expiration is set to 24 hours, strictly aligned with database session TTL.
 *
 * @param payload - User identity, email, role, and server-side sessionId
 * @param secret - Cryptographic JWT secret key
 * @returns Signed JWT string
 */
export function signJwt(payload: JwtUserPayload, secret: string): string {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    },
    secret,
    {
      expiresIn: JWT_EXPIRES_IN,
      algorithm: JWT_ALGORITHM,
    }
  );
}

/**
 * Verifies a JSON Web Token signature, temporal expiration, and expected payload structure.
 * Maps jsonwebtoken library errors to standard AppError envelopes.
 * Explicitly restricts allowed signing algorithms to HMAC-SHA256 ('HS256') to prevent algorithm confusion attacks.
 *
 * IMPORTANT: Cryptographic validity verifies token authenticity and expiration only.
 * It does NOT guarantee that the referenced session in MongoDB is still active.
 * Session revocation checks are performed by database-backed auth middleware.
 *
 * @param token - JWT string to verify
 * @param secret - Cryptographic JWT secret key
 * @returns Decoded and validated JwtUserPayload
 */
export function verifyJwt(token: string, secret: string): JwtUserPayload {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    });

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as Record<string, unknown>).userId !== 'string' ||
      typeof (decoded as Record<string, unknown>).email !== 'string' ||
      typeof (decoded as Record<string, unknown>).sessionId !== 'string' ||
      !Object.values(UserRole).includes((decoded as Record<string, unknown>).role as UserRole)
    ) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid authentication token claims');
    }

    const payload = decoded as Record<string, unknown>;

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      sessionId: payload.sessionId as string,
    };
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }

    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Authentication token has expired');
    }

    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid authentication token');
    }

    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token verification failed');
  }
}
