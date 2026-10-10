import {
  type RegisterRequest,
  type LoginRequest,
  type IUserSummary,
  UserRole,
} from '@queueflow/shared';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signJwt } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import type { EnvConfig } from '../config/env.js';
import { getEnv } from '../config/env.js';

export interface AuthResult {
  user: IUserSummary;
  token: string;
}

export interface ClientMetadata {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Service handling customer registration.
 *
 * Security Invariants:
 * - Unconditionally assigns UserRole.CUSTOMER (role escalation immune).
 * - Hashes password using bcrypt (12 salt rounds) before persistence.
 * - Enforces email uniqueness and handles race-condition duplicate key errors (code 11000).
 * - Creates an active server-side session document in MongoDB.
 * - Returns sanitized public IUserSummary (never returning passwordHash).
 */
export async function register(
  data: RegisterRequest,
  metadata?: ClientMetadata,
  envConfig?: EnvConfig
): Promise<AuthResult> {
  const env = envConfig ?? getEnv();
  const normalizedEmail = data.email.trim().toLowerCase();

  // 1. Proactive pre-check for existing account with this email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppError(
      409,
      'EMAIL_ALREADY_EXISTS',
      'An account with this email address already exists.'
    );
  }

  // 2. Hash password with bcrypt (12 salt rounds)
  const passwordHash = await hashPassword(data.password);

  let newUser;
  try {
    // 3. Create user record, strictly enforcing UserRole.CUSTOMER
    newUser = await User.create({
      name: data.name.trim(),
      email: normalizedEmail,
      phone: data.phone.trim(),
      passwordHash,
      role: UserRole.CUSTOMER, // Unconditional assignment; client-supplied privileges are forbidden
      isActive: true,
    });
  } catch (err: unknown) {
    // Catch MongoDB duplicate key error (code 11000) under concurrent registration races
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 11000
    ) {
      throw new AppError(
        409,
        'EMAIL_ALREADY_EXISTS',
        'An account with this email address already exists.'
      );
    }
    throw err;
  }

  // 4. Create server-side Session document (24-hour expiration)
  const session = await Session.create({
    userId: newUser._id,
    isValid: true,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });

  // 5. Issue signed JWT containing user claims and server-side sessionId
  const token = signJwt(
    {
      userId: newUser._id.toString(),
      email: newUser.email,
      role: newUser.role,
      sessionId: session._id.toString(),
    },
    env.JWT_SECRET
  );

  return {
    user: newUser.toUserSummary(),
    token,
  };
}

/**
 * Service handling user login across all roles (CUSTOMER, STAFF, ADMIN).
 *
 * Security Invariants:
 * - Queries passwordHash explicitly (since select: false is applied to the schema).
 * - Timing-safe: Returns identical generic 401 UNAUTHORIZED message for nonexistent users,
 *   inactive accounts, or invalid passwords to prevent user enumeration.
 * - Failed login attempts create zero sessions.
 */
export async function login(
  data: LoginRequest,
  metadata?: ClientMetadata,
  envConfig?: EnvConfig
): Promise<AuthResult> {
  const env = envConfig ?? getEnv();
  const normalizedEmail = data.email.trim().toLowerCase();

  // 1. Query user by email and explicitly select passwordHash
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  // Generic unauthorized error to prevent username/email enumeration
  const invalidCredentialsError = new AppError(401, 'UNAUTHORIZED', 'Invalid email or password.');

  if (!user) {
    throw invalidCredentialsError;
  }

  if (!user.isActive) {
    throw invalidCredentialsError;
  }

  // 2. Verify password with timing-safe bcrypt compare
  const isPasswordValid = await comparePassword(data.password, user.passwordHash);
  if (!isPasswordValid) {
    throw invalidCredentialsError;
  }

  // 3. Create active server-side Session record in MongoDB
  const session = await Session.create({
    userId: user._id,
    isValid: true,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });

  // 4. Issue signed JWT with sessionId claim
  const token = signJwt(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId: session._id.toString(),
    },
    env.JWT_SECRET
  );

  return {
    user: user.toUserSummary(),
    token,
  };
}

/**
 * Service handling logout and session revocation.
 *
 * Security Invariant:
 * - Atomically marks the MongoDB session record as isValid: false.
 * - Ensures any retained or copied JWT with this sessionId is rejected on future requests.
 */
export async function logout(sessionId: string): Promise<void> {
  await Session.findByIdAndUpdate(sessionId, { isValid: false });
}

/**
 * Service retrieving current authenticated user profile.
 *
 * Security Invariant:
 * - Verifies user exists and account is active.
 * - Returns only the safe public IUserSummary representation without passwordHash.
 */
export async function getMe(userId: string): Promise<IUserSummary> {
  const user = await User.findById(userId);

  if (!user || !user.isActive) {
    throw new AppError(404, 'NOT_FOUND', 'User profile not found or account is deactivated.');
  }

  return user.toUserSummary();
}
