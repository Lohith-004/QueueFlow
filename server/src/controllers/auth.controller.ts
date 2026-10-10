import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse, IUserSummary } from '@queueflow/shared';
import type { EnvConfig } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies.js';
import { AppError } from '../utils/AppError.js';
import '../types/express.d.js';

/**
 * Controller handling public customer registration.
 * HTTP 201 Created on success; sets HttpOnly JWT cookie.
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const env = req.app?.locals?.env as EnvConfig | undefined;
    const metadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.socket.remoteAddress,
    };

    const { user, token } = await (env
      ? authService.register(req.body, metadata, env)
      : authService.register(req.body, metadata));

    // Set HttpOnly auth cookie
    if (env) {
      setAuthCookie(res, token, env.NODE_ENV === 'production');
    } else {
      setAuthCookie(res, token);
    }

    const response: ApiResponse<{ user: IUserSummary }> = {
      success: true,
      data: { user },
      message: 'Registration successful',
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controller handling user login across all roles.
 * HTTP 200 OK on success; sets HttpOnly JWT cookie.
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const env = req.app?.locals?.env as EnvConfig | undefined;
    const metadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.socket.remoteAddress,
    };

    const { user, token } = await (env
      ? authService.login(req.body, metadata, env)
      : authService.login(req.body, metadata));

    // Set HttpOnly auth cookie
    if (env) {
      setAuthCookie(res, token, env.NODE_ENV === 'production');
    } else {
      setAuthCookie(res, token);
    }

    const response: ApiResponse<{ user: IUserSummary }> = {
      success: true,
      data: { user },
      message: 'Login successful',
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controller handling user logout.
 * Uses trusted authenticated context to invalidate MongoDB session and clears HttpOnly cookie.
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.user.sessionId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to log out');
    }

    const env = req.app?.locals?.env as EnvConfig | undefined;

    // Invalidate session in MongoDB
    await authService.logout(req.user.sessionId);

    // Clear HttpOnly auth cookie
    if (env) {
      clearAuthCookie(res, env.NODE_ENV === 'production');
    } else {
      clearAuthCookie(res);
    }

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      message: 'Logged out successfully',
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controller retrieving authenticated user's profile.
 * Relies strictly on req.user.userId populated by authGuard.
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.user.userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to retrieve profile');
    }

    const user = await authService.getMe(req.user.userId);

    const response: ApiResponse<{ user: IUserSummary }> = {
      success: true,
      data: { user },
      message: 'Profile retrieved successfully',
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    next(err);
  }
}
