import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { UserRole } from '@queueflow/shared';
import { requireRoles } from '../../src/middleware/roleGuard.js';
import { AppError } from '../../src/utils/AppError.js';

describe('Role-Based Access Control Guard (server/src/middleware/roleGuard.ts)', () => {
  const dummyCustomer = {
    sessionId: 's1',
    userId: 'u1',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
  };

  const dummyStaff = {
    sessionId: 's2',
    userId: 'u2',
    email: 'staff@example.com',
    role: UserRole.STAFF,
  };

  const dummyAdmin = {
    sessionId: 's3',
    userId: 'u3',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };

  it('should reject with 401 UNAUTHORIZED when authentication context is missing', () => {
    const guard = requireRoles(UserRole.CUSTOMER, UserRole.STAFF);
    const req = {} as Request; // No req.user
    const res = {} as Response;
    const next = vi.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Authentication required to access this resource');
  });

  it('should reject with 403 FORBIDDEN_INSUFFICIENT_PERMISSIONS when user role is not permitted', () => {
    // Endpoint requires STAFF or ADMIN
    const guard = requireRoles(UserRole.STAFF, UserRole.ADMIN);
    const req = { user: dummyCustomer } as Request;
    const res = {} as Response;
    const next = vi.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    expect(err.message).toBe('Insufficient permissions to access this resource');
  });

  it('should call next() without error when user possesses the required role', () => {
    const staffGuard = requireRoles(UserRole.STAFF, UserRole.ADMIN);
    const req = { user: dummyStaff } as Request;
    const res = {} as Response;
    const next = vi.fn();

    staffGuard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // No error passed
  });

  it('should authorize ADMIN for admin-only endpoint', () => {
    const adminGuard = requireRoles(UserRole.ADMIN);
    const req = { user: dummyAdmin } as Request;
    const res = {} as Response;
    const next = vi.fn();

    adminGuard(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });
});
