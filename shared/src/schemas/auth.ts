import { z } from 'zod';

/**
 * Schema for public customer registration.
 * Explicitly rejects unknown fields (including any client-supplied 'role') via .strict().
 * Public registration must never allow privilege assignment.
 */
export const registerSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address'),
    phone: z
      .string({ required_error: 'Phone number is required' })
      .trim()
      .min(7, 'Phone number must be at least 7 digits')
      .max(20, 'Phone number must not exceed 20 characters'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password must not exceed 128 characters'),
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerSchema>;

/**
 * Schema for user login.
 * Rejects unknown fields via .strict().
 */
export const loginSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address'),
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginSchema>;
