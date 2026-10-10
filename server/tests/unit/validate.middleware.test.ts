import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../../src/middleware/validate.js';
import { AppError } from '../../src/utils/AppError.js';

describe('Request Validation Middleware (server/src/middleware/validate.ts)', () => {
  const testSchema = z
    .object({
      email: z.string().email('Invalid email address'),
      age: z.number().int().min(18, 'Must be at least 18'),
    })
    .strict();

  it('should call next() and assign parsed data to req.body on valid input', () => {
    const middleware = validateBody(testSchema);
    const req = {
      body: {
        email: 'user@example.com',
        age: 25,
      },
    } as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.body).toEqual({
      email: 'user@example.com',
      age: 25,
    });
  });

  it('should forward an AppError with 400 VALIDATION_ERROR and structured field details on invalid input', () => {
    const middleware = validateBody(testSchema);
    const req = {
      body: {
        email: 'not-an-email',
        age: 12,
      },
    } as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const errorArg = next.mock.calls[0][0];

    expect(errorArg).toBeInstanceOf(AppError);
    expect(errorArg.statusCode).toBe(400);
    expect(errorArg.code).toBe('VALIDATION_ERROR');
    expect(errorArg.message).toBe('Request validation failed');
    expect(errorArg.details).toBeDefined();
    expect(errorArg.details?.length).toBe(2);

    const emailDetail = errorArg.details?.find((d: { field?: string }) => d.field === 'email');
    expect(emailDetail?.message).toBe('Invalid email address');

    const ageDetail = errorArg.details?.find((d: { field?: string }) => d.field === 'age');
    expect(ageDetail?.message).toBe('Must be at least 18');
  });

  it('should reject unknown fields when schema is strict', () => {
    const middleware = validateBody(testSchema);
    const req = {
      body: {
        email: 'user@example.com',
        age: 30,
        role: 'ADMIN', // Unknown field injection
      },
    } as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const errorArg = next.mock.calls[0][0];

    expect(errorArg).toBeInstanceOf(AppError);
    expect(errorArg.statusCode).toBe(400);
    expect(errorArg.code).toBe('VALIDATION_ERROR');

    const roleDetail = errorArg.details?.find((d: { field?: string }) => d.field === 'role');
    expect(roleDetail).toBeDefined();
  });
});
