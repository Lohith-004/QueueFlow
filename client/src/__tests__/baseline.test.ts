import { describe, it, expect } from 'vitest';
import { UserRole } from '@queueflow/shared';

describe('Client Baseline Tooling & Shared Contract Linking', () => {
  it('should correctly import enums from @queueflow/shared', () => {
    expect(UserRole.CUSTOMER).toBe('CUSTOMER');
    expect(UserRole.STAFF).toBe('STAFF');
    expect(UserRole.ADMIN).toBe('ADMIN');
  });
});
