import { describe, it, expect } from 'vitest';
import {
  UserRole,
  AppointmentStatus,
  TicketStatus,
  ApiResponse,
  ApiErrorResponse,
  userRoleSchema,
  appointmentStatusSchema,
  ticketStatusSchema,
  isoDateStringSchema,
  timeStringSchema,
  BUSINESS_HOURS,
} from '../src/index.js';

describe('Shared Contracts & Enums', () => {
  it('should define correct UserRole enum values', () => {
    expect(UserRole.CUSTOMER).toBe('CUSTOMER');
    expect(UserRole.STAFF).toBe('STAFF');
    expect(UserRole.ADMIN).toBe('ADMIN');
  });

  it('should define correct AppointmentStatus enum values', () => {
    expect(AppointmentStatus.BOOKED).toBe('BOOKED');
    expect(AppointmentStatus.CHECKED_IN).toBe('CHECKED_IN');
    expect(AppointmentStatus.COMPLETED).toBe('COMPLETED');
    expect(AppointmentStatus.CANCELLED).toBe('CANCELLED');
    expect(AppointmentStatus.NO_SHOW).toBe('NO_SHOW');
  });

  it('should define correct TicketStatus enum values', () => {
    expect(TicketStatus.WAITING).toBe('WAITING');
    expect(TicketStatus.CALLED).toBe('CALLED');
    expect(TicketStatus.SERVING).toBe('SERVING');
    expect(TicketStatus.COMPLETED).toBe('COMPLETED');
    expect(TicketStatus.CANCELLED).toBe('CANCELLED');
    expect(TicketStatus.NO_SHOW).toBe('NO_SHOW');
  });

  it('should validate UserRole using Zod schema', () => {
    expect(userRoleSchema.parse('CUSTOMER')).toBe(UserRole.CUSTOMER);
    expect(userRoleSchema.parse('STAFF')).toBe(UserRole.STAFF);
    expect(userRoleSchema.parse('ADMIN')).toBe(UserRole.ADMIN);
    expect(() => userRoleSchema.parse('SUPERUSER')).toThrow();
  });

  it('should validate AppointmentStatus and TicketStatus using Zod', () => {
    expect(appointmentStatusSchema.parse('BOOKED')).toBe(AppointmentStatus.BOOKED);
    expect(ticketStatusSchema.parse('CALLED')).toBe(TicketStatus.CALLED);
    expect(() => appointmentStatusSchema.parse('UNKNOWN')).toThrow();
  });

  it('should validate date and time string schemas', () => {
    expect(isoDateStringSchema.parse('2026-10-15')).toBe('2026-10-15');
    expect(() => isoDateStringSchema.parse('15-10-2026')).toThrow();
    expect(timeStringSchema.parse('09:30')).toBe('09:30');
    expect(() => timeStringSchema.parse('25:00')).toThrow();
  });

  it('should conform to ApiResponse envelope shape', () => {
    const successResponse: ApiResponse<{ count: number }> = {
      success: true,
      data: { count: 5 },
      message: 'Operation succeeded',
    };
    expect(successResponse.success).toBe(true);
    expect(successResponse.data.count).toBe(5);

    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: [{ field: 'email', message: 'Invalid format' }],
      },
    };
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error.code).toBe('VALIDATION_ERROR');
  });

  it('should contain expected default business hours', () => {
    expect(BUSINESS_HOURS.OPEN_TIME).toBe('09:00');
    expect(BUSINESS_HOURS.CLOSE_TIME).toBe('17:00');
    expect(BUSINESS_HOURS.DEFAULT_TIMEZONE).toBe('UTC');
  });
});
