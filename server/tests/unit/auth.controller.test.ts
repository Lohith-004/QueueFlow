import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { UserRole } from '@queueflow/shared';
import * as authController from '../../src/controllers/auth.controller.js';
import * as authService from '../../src/services/auth.service.js';
import * as cookieUtils from '../../src/utils/cookies.js';
import { AppError } from '../../src/utils/AppError.js';

describe('Authentication Controller (server/src/controllers/auth.controller.ts)', () => {
  const dummyUserSummary = {
    id: 'u1',
    name: 'Elena Rostova',
    email: 'elena@example.com',
    phone: '555-0199',
    role: UserRole.CUSTOMER,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockReq = {
      body: {},
      headers: { 'user-agent': 'TestAgent' },
      ip: '127.0.0.1',
      socket: {} as never,
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('register', () => {
    it('should call authService.register, set cookie, and respond with HTTP 201', async () => {
      mockReq.body = {
        name: 'Elena Rostova',
        email: 'elena@example.com',
        phone: '555-0199',
        password: 'Password123!',
      };

      vi.spyOn(authService, 'register').mockResolvedValue({
        user: dummyUserSummary,
        token: 'signed.jwt.token',
      });
      const setCookieSpy = vi.spyOn(cookieUtils, 'setAuthCookie').mockImplementation(() => {});

      await authController.register(mockReq as Request, mockRes as Response, mockNext);

      expect(authService.register).toHaveBeenCalledWith(mockReq.body, {
        userAgent: 'TestAgent',
        ipAddress: '127.0.0.1',
      });
      expect(setCookieSpy).toHaveBeenCalledWith(mockRes, 'signed.jwt.token');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { user: dummyUserSummary },
        message: 'Registration successful',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should forward service errors to next()', async () => {
      const error = new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email exists');
      vi.spyOn(authService, 'register').mockRejectedValue(error);

      await authController.register(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('login', () => {
    it('should call authService.login, set cookie, and respond with HTTP 200', async () => {
      mockReq.body = {
        email: 'elena@example.com',
        password: 'Password123!',
      };

      vi.spyOn(authService, 'login').mockResolvedValue({
        user: dummyUserSummary,
        token: 'signed.jwt.token',
      });
      const setCookieSpy = vi.spyOn(cookieUtils, 'setAuthCookie').mockImplementation(() => {});

      await authController.login(mockReq as Request, mockRes as Response, mockNext);

      expect(authService.login).toHaveBeenCalledWith(mockReq.body, {
        userAgent: 'TestAgent',
        ipAddress: '127.0.0.1',
      });
      expect(setCookieSpy).toHaveBeenCalledWith(mockRes, 'signed.jwt.token');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { user: dummyUserSummary },
        message: 'Login successful',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should forward login errors to next()', async () => {
      const error = new AppError(401, 'UNAUTHORIZED', 'Invalid email or password.');
      vi.spyOn(authService, 'login').mockRejectedValue(error);

      await authController.login(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('logout', () => {
    it('should call authService.logout, clear cookie, and respond with HTTP 200', async () => {
      mockReq.user = {
        sessionId: 'session_123',
        userId: 'u1',
        role: UserRole.CUSTOMER,
        email: 'elena@example.com',
      };

      vi.spyOn(authService, 'logout').mockResolvedValue();
      const clearCookieSpy = vi.spyOn(cookieUtils, 'clearAuthCookie').mockImplementation(() => {});

      await authController.logout(mockReq as Request, mockRes as Response, mockNext);

      expect(authService.logout).toHaveBeenCalledWith('session_123');
      expect(clearCookieSpy).toHaveBeenCalledWith(mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: null,
        message: 'Logged out successfully',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should forward 401 UNAUTHORIZED if req.user is absent', async () => {
      mockReq.user = undefined;

      await authController.logout(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      const err = mockNext.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });
  });

  describe('getMe', () => {
    it('should call authService.getMe and respond with HTTP 200 and user data', async () => {
      mockReq.user = {
        sessionId: 'session_123',
        userId: 'u1',
        role: UserRole.CUSTOMER,
        email: 'elena@example.com',
      };

      vi.spyOn(authService, 'getMe').mockResolvedValue(dummyUserSummary);

      await authController.getMe(mockReq as Request, mockRes as Response, mockNext);

      expect(authService.getMe).toHaveBeenCalledWith('u1');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { user: dummyUserSummary },
        message: 'Profile retrieved successfully',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should forward 401 UNAUTHORIZED if req.user is absent', async () => {
      mockReq.user = undefined;

      await authController.getMe(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      const err = mockNext.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });
  });
});
