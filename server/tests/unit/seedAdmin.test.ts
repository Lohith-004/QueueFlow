import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { UserRole } from '@queueflow/shared';
import { seedAdmin, adminCredentialsSchema } from '../../src/scripts/seedAdmin.js';
import { User } from '../../src/models/User.js';
import { comparePassword } from '../../src/utils/password.js';
import type { EnvConfig } from '../../src/config/env.js';

describe('Administrator Provisioning Script (server/src/scripts/seedAdmin.ts)', () => {
  const testDbUri = 'mongodb://localhost:27017/queueflow_test_seed_admin';

  const testEnv: EnvConfig = {
    PORT: 5098,
    NODE_ENV: 'test',
    MONGO_URI: testDbUri,
    JWT_SECRET: 'test_jwt_secret_with_more_than_32_characters_for_unit_tests',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(testDbUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('Credential Validation Schema', () => {
    it('should reject missing email', () => {
      const result = adminCredentialsSchema.safeParse({
        ADMIN_INITIAL_PASSWORD: 'ValidPassword123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const result = adminCredentialsSchema.safeParse({
        ADMIN_EMAIL: 'not-an-email',
        ADMIN_INITIAL_PASSWORD: 'ValidPassword123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = adminCredentialsSchema.safeParse({
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_INITIAL_PASSWORD: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid credentials and normalize email', () => {
      const result = adminCredentialsSchema.safeParse({
        ADMIN_EMAIL: '  Admin.Test@EXAMPLE.com  ',
        ADMIN_INITIAL_PASSWORD: 'ValidPassword123!',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ADMIN_EMAIL).toBe('admin.test@example.com');
      }
    });
  });

  describe('seedAdmin Execution & Idempotency', () => {
    const validAdminCredentials = {
      email: 'admin@queueflow.com',
      password: 'AdminSuperPassword123!',
      env: testEnv,
      disconnectOnFinish: false, // Keep connection open during test suite
    };

    it('should fail safely when credentials are missing or invalid', async () => {
      const result = await seedAdmin({
        email: 'invalid-email',
        password: 'short',
        env: testEnv,
        disconnectOnFinish: false,
      });

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe('error');
      expect(result.message).toContain('Validation error');

      const count = await User.countDocuments();
      expect(count).toBe(0);
    });

    it('should successfully provision an ADMIN user with hashed password and active status', async () => {
      const result = await seedAdmin(validAdminCredentials);

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe('created');
      expect(result.message).toContain('provisioned successfully');

      // Verify user in database
      const createdUser = await User.findOne({ email: 'admin@queueflow.com' }).select(
        '+passwordHash'
      );
      expect(createdUser).not.toBeNull();
      expect(createdUser?.role).toBe(UserRole.ADMIN);
      expect(createdUser?.isActive).toBe(true);
      expect(createdUser?.passwordHash).toMatch(/^\$2[aby]\$12\$/); // Cost factor 12

      // Verify password can be validated with bcrypt
      const passwordMatches = await comparePassword(
        validAdminCredentials.password,
        createdUser?.passwordHash || ''
      );
      expect(passwordMatches).toBe(true);
    });

    it('should be safe and idempotent on repeated execution', async () => {
      // First run provisions the admin
      const firstResult = await seedAdmin(validAdminCredentials);
      expect(firstResult.success).toBe(true);
      expect(firstResult.actionTaken).toBe('created');

      // Second run detects existing admin and completes with no modifications
      const secondResult = await seedAdmin(validAdminCredentials);
      expect(secondResult.success).toBe(true);
      expect(secondResult.actionTaken).toBe('already_exists');
      expect(secondResult.message).toContain('already exists. No action required.');

      // Verify still exactly 1 user in database
      const count = await User.countDocuments();
      expect(count).toBe(1);
    });

    it('should refuse to promote an existing customer or overwrite their password', async () => {
      // Pre-create an existing customer with the same email
      await User.create({
        name: 'Existing Customer',
        email: 'admin@queueflow.com',
        phone: '555-1234',
        passwordHash: '$2b$12$existingCustomerHashedPasswordForSecurityTest',
        role: UserRole.CUSTOMER,
        isActive: true,
      });

      // Attempt to seed admin with this email
      const result = await seedAdmin(validAdminCredentials);

      expect(result.success).toBe(false);
      expect(result.actionTaken).toBe('error');
      expect(result.message).toContain('Security violation');
      expect(result.message).toContain('Refusing to promote or overwrite password');

      // Verify customer account was NOT modified
      const user = await User.findOne({ email: 'admin@queueflow.com' });
      expect(user?.role).toBe(UserRole.CUSTOMER);
      expect(user?.name).toBe('Existing Customer');
    });

    it('should never expose passwords or secrets in result messages', async () => {
      const secretPassword = 'MySuperSecretPasswordXYZ!';
      const result = await seedAdmin({
        email: 'admin@queueflow.com',
        password: secretPassword,
        env: testEnv,
        disconnectOnFinish: false,
      });

      expect(result.message).not.toContain(secretPassword);
      expect(result.message).not.toContain(testEnv.JWT_SECRET);
      expect(result.message).not.toContain(testEnv.MONGO_URI);
    });
  });
});
