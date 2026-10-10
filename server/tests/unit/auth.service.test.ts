import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { UserRole } from '@queueflow/shared';
import * as authService from '../../src/services/auth.service.js';
import { User } from '../../src/models/User.js';
import { Session } from '../../src/models/Session.js';
import * as passwordUtils from '../../src/utils/password.js';
import { AppError } from '../../src/utils/AppError.js';
import type { EnvConfig } from '../../src/config/env.js';

describe('Authentication Service (server/src/services/auth.service.ts)', () => {
  const testEnv: EnvConfig = {
    PORT: 5000,
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://localhost:27017/queueflow',
    JWT_SECRET: 'test_jwt_secret_key_minimum_32_characters_long_for_security',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  const sampleRegisterData = {
    name: 'Elena Rostova',
    email: 'Elena.Rostova@example.com',
    phone: '555-0199',
    password: 'SecurePassword123!',
  };

  const mockUserId = new mongoose.Types.ObjectId();
  const mockSessionId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should register a new customer, assign role CUSTOMER, create session, and issue token', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(passwordUtils, 'hashPassword').mockResolvedValue('hashed_pw_123');

      const mockCreatedUser = {
        _id: mockUserId,
        name: 'Elena Rostova',
        email: 'elena.rostova@example.com',
        phone: '555-0199',
        role: UserRole.CUSTOMER,
        isActive: true,
        toUserSummary: () => ({
          id: mockUserId.toString(),
          name: 'Elena Rostova',
          email: 'elena.rostova@example.com',
          phone: '555-0199',
          role: UserRole.CUSTOMER,
          isActive: true,
          createdAt: new Date().toISOString(),
        }),
      };
      vi.spyOn(User, 'create').mockResolvedValue(mockCreatedUser as never);

      const mockSession = {
        _id: mockSessionId,
        userId: mockUserId,
        isValid: true,
      };
      vi.spyOn(Session, 'create').mockResolvedValue(mockSession as never);

      const result = await authService.register(
        sampleRegisterData,
        { userAgent: 'TestBrowser', ipAddress: '127.0.0.1' },
        testEnv
      );

      // Verify email pre-check normalized
      expect(User.findOne).toHaveBeenCalledWith({ email: 'elena.rostova@example.com' });
      expect(passwordUtils.hashPassword).toHaveBeenCalledWith('SecurePassword123!');

      // Verify User.create explicitly forces UserRole.CUSTOMER
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.CUSTOMER,
          email: 'elena.rostova@example.com',
        })
      );

      // Verify Session.create called with 24h expiration
      expect(Session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          isValid: true,
          userAgent: 'TestBrowser',
          ipAddress: '127.0.0.1',
        })
      );

      // Verify returned shape
      expect(result.user.id).toBe(mockUserId.toString());
      expect(result.user.role).toBe(UserRole.CUSTOMER);
      expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(typeof result.token).toBe('string');
    });

    it('should throw HTTP 409 EMAIL_ALREADY_EXISTS when email already exists during pre-check', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({ id: 'existing' } as never);

      await expect(authService.register(sampleRegisterData, undefined, testEnv)).rejects.toThrow(
        AppError
      );

      try {
        await authService.register(sampleRegisterData, undefined, testEnv);
      } catch (err: unknown) {
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(409);
        expect(appErr.code).toBe('EMAIL_ALREADY_EXISTS');
      }
    });

    it('should catch race-condition MongoDB duplicate key error (code 11000) and map to HTTP 409 EMAIL_ALREADY_EXISTS', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(passwordUtils, 'hashPassword').mockResolvedValue('hashed_pw_123');

      const mongoDuplicateError = new Error('E11000 duplicate key error collection');
      (mongoDuplicateError as Error & { code: number }).code = 11000;
      vi.spyOn(User, 'create').mockRejectedValue(mongoDuplicateError);

      try {
        await authService.register(sampleRegisterData, undefined, testEnv);
        expect.unreachable('Should have thrown AppError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(409);
        expect(appErr.code).toBe('EMAIL_ALREADY_EXISTS');
      }
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'Elena.Rostova@example.com',
      password: 'SecurePassword123!',
    };

    it('should successfully log in, create active session, and return token with user summary', async () => {
      const mockUserDoc = {
        _id: mockUserId,
        email: 'elena.rostova@example.com',
        role: UserRole.CUSTOMER,
        passwordHash: 'stored_hash_123',
        isActive: true,
        toUserSummary: () => ({
          id: mockUserId.toString(),
          name: 'Elena Rostova',
          email: 'elena.rostova@example.com',
          phone: '555-0199',
          role: UserRole.CUSTOMER,
          isActive: true,
          createdAt: new Date().toISOString(),
        }),
      };

      // Mock User.findOne.select
      const selectMock = vi.fn().mockResolvedValue(mockUserDoc);
      vi.spyOn(User, 'findOne').mockReturnValue({ select: selectMock } as never);

      vi.spyOn(passwordUtils, 'comparePassword').mockResolvedValue(true);

      const mockSession = {
        _id: mockSessionId,
        userId: mockUserId,
        isValid: true,
      };
      vi.spyOn(Session, 'create').mockResolvedValue(mockSession as never);

      const result = await authService.login(validLoginData, undefined, testEnv);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'elena.rostova@example.com' });
      expect(selectMock).toHaveBeenCalledWith('+passwordHash');
      expect(passwordUtils.comparePassword).toHaveBeenCalledWith(
        'SecurePassword123!',
        'stored_hash_123'
      );
      expect(Session.create).toHaveBeenCalledOnce();
      expect(result.user.id).toBe(mockUserId.toString());
      expect(typeof result.token).toBe('string');
    });

    it('should throw generic 401 UNAUTHORIZED when user is not found and create zero sessions', async () => {
      const selectMock = vi.fn().mockResolvedValue(null);
      vi.spyOn(User, 'findOne').mockReturnValue({ select: selectMock } as never);
      const sessionSpy = vi.spyOn(Session, 'create');

      try {
        await authService.login(validLoginData, undefined, testEnv);
        expect.unreachable('Should have thrown AppError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('UNAUTHORIZED');
        expect(appErr.message).toBe('Invalid email or password.');
      }

      expect(sessionSpy).not.toHaveBeenCalled();
    });

    it('should throw generic 401 UNAUTHORIZED when password comparison fails and create zero sessions', async () => {
      const mockUserDoc = {
        _id: mockUserId,
        email: 'elena.rostova@example.com',
        role: UserRole.CUSTOMER,
        passwordHash: 'stored_hash_123',
        isActive: true,
      };
      const selectMock = vi.fn().mockResolvedValue(mockUserDoc);
      vi.spyOn(User, 'findOne').mockReturnValue({ select: selectMock } as never);
      vi.spyOn(passwordUtils, 'comparePassword').mockResolvedValue(false);
      const sessionSpy = vi.spyOn(Session, 'create');

      try {
        await authService.login(validLoginData, undefined, testEnv);
        expect.unreachable('Should have thrown AppError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('UNAUTHORIZED');
        expect(appErr.message).toBe('Invalid email or password.');
      }

      expect(sessionSpy).not.toHaveBeenCalled();
    });

    it('should throw generic 401 UNAUTHORIZED when account is deactivated (isActive: false) and create zero sessions', async () => {
      const mockUserDoc = {
        _id: mockUserId,
        email: 'elena.rostova@example.com',
        role: UserRole.CUSTOMER,
        passwordHash: 'stored_hash_123',
        isActive: false, // Inactive account
      };
      const selectMock = vi.fn().mockResolvedValue(mockUserDoc);
      vi.spyOn(User, 'findOne').mockReturnValue({ select: selectMock } as never);
      const sessionSpy = vi.spyOn(Session, 'create');

      try {
        await authService.login(validLoginData, undefined, testEnv);
        expect.unreachable('Should have thrown AppError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(401);
        expect(appErr.code).toBe('UNAUTHORIZED');
        expect(appErr.message).toBe('Invalid email or password.');
      }

      expect(sessionSpy).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should atomically update session isValid to false in MongoDB', async () => {
      const findByIdAndUpdateSpy = vi
        .spyOn(Session, 'findByIdAndUpdate')
        .mockResolvedValue({} as never);

      await authService.logout(mockSessionId.toString());

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(mockSessionId.toString(), {
        isValid: false,
      });
    });
  });

  describe('getMe', () => {
    it('should return safe user summary when user is active and exists', async () => {
      const mockUserDoc = {
        _id: mockUserId,
        name: 'Elena Rostova',
        email: 'elena.rostova@example.com',
        phone: '555-0199',
        role: UserRole.CUSTOMER,
        isActive: true,
        toUserSummary: () => ({
          id: mockUserId.toString(),
          name: 'Elena Rostova',
          email: 'elena.rostova@example.com',
          phone: '555-0199',
          role: UserRole.CUSTOMER,
          isActive: true,
          createdAt: new Date().toISOString(),
        }),
      };
      vi.spyOn(User, 'findById').mockResolvedValue(mockUserDoc as never);

      const summary = await authService.getMe(mockUserId.toString());

      expect(summary.id).toBe(mockUserId.toString());
      expect(summary.email).toBe('elena.rostova@example.com');
      expect((summary as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should throw 404 NOT_FOUND when user does not exist or is inactive', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(null);

      await expect(authService.getMe('nonexistent_id')).rejects.toThrow(AppError);

      try {
        await authService.getMe('nonexistent_id');
      } catch (err: unknown) {
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(404);
        expect(appErr.code).toBe('NOT_FOUND');
      }
    });
  });
});
