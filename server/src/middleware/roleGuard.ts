import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRole } from '@queueflow/shared';
import { AppError } from '../utils/AppError.js';
import '../types/express.d.js';

/**
 * Middleware factory enforcing Role-Based Access Control (RBAC).
 * Authorizes requests strictly using verified request context populated by authGuard.
 *
 * @param allowedRoles - One or more roles authorized to access the protected endpoint
 * @returns Express request handler
 */
export function requireRoles(...allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 1. Fail safely if authentication context is missing
    if (!req.user) {
      return next(
        new AppError(401, 'UNAUTHORIZED', 'Authentication required to access this resource')
      );
    }

    // 2. Reject request if user role is not among the authorized roles
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to access this resource'
        )
      );
    }

    next();
  };
}
