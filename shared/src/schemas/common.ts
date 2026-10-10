import { z } from 'zod';
import { UserRole } from '../types/auth.js';
import { AppointmentStatus } from '../types/appointment.js';
import { TicketStatus } from '../types/queue.js';

export const userRoleSchema = z.nativeEnum(UserRole);
export const appointmentStatusSchema = z.nativeEnum(AppointmentStatus);
export const ticketStatusSchema = z.nativeEnum(TicketStatus);

// ISO 8601 Date regex YYYY-MM-DD
export const isoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD');

// 24-hour time regex HH:mm
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour format HH:mm');
