import { describe, it, expect } from 'vitest';
import { UserRole, AppointmentStatus, TicketStatus } from '@queueflow/shared';
import { SERVER_NAME } from '../../src/index.js';

describe('Server Baseline Tooling & Shared Contract Linking', () => {
  it('should export the server identity constant', () => {
    expect(SERVER_NAME).toBe('QueueFlow Server');
  });

  it('should correctly consume enums from @queueflow/shared workspace', () => {
    expect(UserRole.CUSTOMER).toBe('CUSTOMER');
    expect(AppointmentStatus.BOOKED).toBe('BOOKED');
    expect(TicketStatus.WAITING).toBe('WAITING');
  });
});
