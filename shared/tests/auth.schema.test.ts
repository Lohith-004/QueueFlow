import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../src/index.js';

describe('Authentication Schemas (shared/src/schemas/auth.ts)', () => {
  describe('registerSchema', () => {
    const validRegistration = {
      name: 'Elena Rostova',
      email: 'Elena.Rostova@example.com',
      phone: '555-0199',
      password: 'SecurePassword123!',
    };

    it('should validate and parse a valid customer registration payload', () => {
      const parsed = registerSchema.parse(validRegistration);

      expect(parsed.name).toBe('Elena Rostova');
      expect(parsed.email).toBe('elena.rostova@example.com'); // Lowercased
      expect(parsed.phone).toBe('555-0199');
      expect(parsed.password).toBe('SecurePassword123!');
    });

    it('should trim whitespace from name, email, and phone', () => {
      const parsed = registerSchema.parse({
        name: '   John Doe   ',
        email: '   john@example.com   ',
        phone: '   +15551234567   ',
        password: 'ValidPassword123!',
      });

      expect(parsed.name).toBe('John Doe');
      expect(parsed.email).toBe('john@example.com');
      expect(parsed.phone).toBe('+15551234567');
    });

    it('should strictly reject unknown fields (including role injection attempts)', () => {
      // Role escalation attempt: client sends role: ADMIN
      const payloadWithAdminRole = {
        ...validRegistration,
        role: 'ADMIN',
      };

      const resultAdmin = registerSchema.safeParse(payloadWithAdminRole);
      expect(resultAdmin.success).toBe(false);
      if (!resultAdmin.success) {
        expect(resultAdmin.error.issues[0].code).toBe('unrecognized_keys');
        expect(resultAdmin.error.issues[0].message).toContain('role');
      }

      // Role escalation attempt: client sends role: STAFF
      const payloadWithStaffRole = {
        ...validRegistration,
        role: 'STAFF',
      };

      const resultStaff = registerSchema.safeParse(payloadWithStaffRole);
      expect(resultStaff.success).toBe(false);

      // Arbitrary unknown field
      const payloadWithUnknownField = {
        ...validRegistration,
        isSuperUser: true,
      };

      const resultUnknown = registerSchema.safeParse(payloadWithUnknownField);
      expect(resultUnknown.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      expect(() =>
        registerSchema.parse({
          email: 'test@example.com',
          phone: '1234567',
          password: 'password123',
        })
      ).toThrow(/Name is required/);
      expect(() =>
        registerSchema.parse({ name: 'Test', phone: '1234567', password: 'password123' })
      ).toThrow(/Email is required/);
      expect(() =>
        registerSchema.parse({ name: 'Test', email: 'test@example.com', password: 'password123' })
      ).toThrow(/Phone number is required/);
      expect(() =>
        registerSchema.parse({ name: 'Test', email: 'test@example.com', phone: '1234567' })
      ).toThrow(/Password is required/);
    });

    it('should enforce name constraints (min 2, max 100)', () => {
      expect(() => registerSchema.parse({ ...validRegistration, name: 'A' })).toThrow(
        /at least 2 characters/
      );
      expect(() => registerSchema.parse({ ...validRegistration, name: 'A'.repeat(101) })).toThrow(
        /not exceed 100 characters/
      );
    });

    it('should enforce valid email formatting', () => {
      expect(() => registerSchema.parse({ ...validRegistration, email: 'not-an-email' })).toThrow(
        /Invalid email address/
      );
      expect(() => registerSchema.parse({ ...validRegistration, email: 'user@' })).toThrow(
        /Invalid email address/
      );
      expect(() => registerSchema.parse({ ...validRegistration, email: '@domain.com' })).toThrow(
        /Invalid email address/
      );
    });

    it('should enforce phone constraints (min 7, max 20)', () => {
      expect(() => registerSchema.parse({ ...validRegistration, phone: '12345' })).toThrow(
        /at least 7 digits/
      );
      expect(() => registerSchema.parse({ ...validRegistration, phone: '1'.repeat(21) })).toThrow(
        /not exceed 20 characters/
      );
    });

    it('should enforce password constraints (min 8, max 128)', () => {
      expect(() => registerSchema.parse({ ...validRegistration, password: 'short' })).toThrow(
        /at least 8 characters/
      );
      expect(() =>
        registerSchema.parse({ ...validRegistration, password: 'A'.repeat(129) })
      ).toThrow(/not exceed 128 characters/);
    });
  });

  describe('loginSchema', () => {
    const validLogin = {
      email: 'Elena.Rostova@example.com',
      password: 'SecurePassword123!',
    };

    it('should validate and parse a valid login payload', () => {
      const parsed = loginSchema.parse(validLogin);

      expect(parsed.email).toBe('elena.rostova@example.com');
      expect(parsed.password).toBe('SecurePassword123!');
    });

    it('should strictly reject unknown fields in login payload', () => {
      const payloadWithUnknown = {
        ...validLogin,
        extraParam: 'unexpected',
      };

      const result = loginSchema.safeParse(payloadWithUnknown);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('unrecognized_keys');
      }
    });

    it('should reject missing email or password', () => {
      expect(() => loginSchema.parse({ email: 'test@example.com' })).toThrow(
        /Password is required/
      );
      expect(() => loginSchema.parse({ password: 'password123' })).toThrow(/Email is required/);
    });

    it('should reject invalid email format in login', () => {
      expect(() => loginSchema.parse({ email: 'invalid-email', password: 'password123' })).toThrow(
        /Invalid email address/
      );
    });

    it('should reject empty password in login', () => {
      expect(() => loginSchema.parse({ email: 'test@example.com', password: '' })).toThrow(
        /Password is required/
      );
    });
  });
});
