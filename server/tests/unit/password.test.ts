import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, BCRYPT_SALT_ROUNDS } from '../../src/utils/password.js';

describe('Password Utilities (server/src/utils/password.ts)', () => {
  it('should use 12 salt rounds for bcrypt hashing', () => {
    expect(BCRYPT_SALT_ROUNDS).toBe(12);
  });

  describe('hashPassword', () => {
    it('should generate a valid bcrypt hash with cost factor 12', async () => {
      const plaintext = 'SuperSecretPass123!';
      const hash = await hashPassword(plaintext);

      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(plaintext);
      // Bcrypt hash structure: $2b$[rounds]$[22 salt chars][31 hash chars]
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
    });

    it('should generate unique hashes for identical passwords due to unique salts', async () => {
      const password = 'ConsistentPassword!2026';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'CorrectPassword!999';
      const hash = await hashPassword(password);

      const isMatch = await comparePassword(password, hash);
      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'CorrectPassword!999';
      const wrongPassword = 'WrongPassword!999';
      const hash = await hashPassword(password);

      const isMatch = await comparePassword(wrongPassword, hash);
      expect(isMatch).toBe(false);
    });

    it('should return false when compared against an invalid or mismatched hash', async () => {
      const isMatch = await comparePassword(
        'SomePassword',
        '$2b$12$e8Y5t1hKq1KzQvV9B1RkUe1O5W7z6Y4x3V2u1t0s9r8q7p6o5n4m3'
      );
      expect(isMatch).toBe(false);
    });
  });
});
