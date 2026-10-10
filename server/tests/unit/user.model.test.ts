import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { UserRole } from '@queueflow/shared';
import { User } from '../../src/models/User.js';

describe('User Model (server/src/models/User.ts)', () => {
  const validUserData = {
    name: 'Elena Rostova',
    email: 'elena@example.com',
    passwordHash: '$2b$12$someSecureHashedPasswordStringForTesting1234567890',
    phone: '555-0199',
  };

  it('should successfully validate a complete user document', async () => {
    const user = new User(validUserData);
    const validationError = await user.validate().catch((err: unknown) => err);

    expect(validationError).toBeUndefined();
    expect(user.role).toBe(UserRole.CUSTOMER); // Default
    expect(user.isActive).toBe(true); // Default
  });

  it('should normalize email to lowercase and trim whitespace', () => {
    const user = new User({
      ...validUserData,
      email: '   Elena.Rostova@EXAMPLE.COM   ',
    });

    expect(user.email).toBe('elena.rostova@example.com');
  });

  it('should require name, email, passwordHash, and phone', async () => {
    const emptyUser = new User({});
    const validationError = (await emptyUser
      .validate()
      .catch((err: unknown) => err)) as mongoose.Error.ValidationError;

    expect(validationError).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(validationError.errors.name).toBeDefined();
    expect(validationError.errors.email).toBeDefined();
    expect(validationError.errors.passwordHash).toBeDefined();
    expect(validationError.errors.phone).toBeDefined();
  });

  it('should enforce role to only accepted UserRole values', async () => {
    // Valid roles
    for (const role of Object.values(UserRole)) {
      const user = new User({ ...validUserData, role });
      const err = await user.validate().catch((e: unknown) => e);
      expect(err).toBeUndefined();
    }

    // Invalid role
    const invalidUser = new User({
      ...validUserData,
      role: 'SUPERUSER',
    });
    const err = (await invalidUser
      .validate()
      .catch((e: unknown) => e)) as mongoose.Error.ValidationError;

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.role).toBeDefined();
  });

  it('should enforce name length boundaries (min 2, max 100)', async () => {
    const tooShort = new User({ ...validUserData, name: 'A' });
    const errShort = (await tooShort
      .validate()
      .catch((e: unknown) => e)) as mongoose.Error.ValidationError;
    expect(errShort.errors.name).toBeDefined();

    const tooLong = new User({ ...validUserData, name: 'A'.repeat(101) });
    const errLong = (await tooLong
      .validate()
      .catch((e: unknown) => e)) as mongoose.Error.ValidationError;
    expect(errLong.errors.name).toBeDefined();
  });

  describe('Security & Sanitization Invariants', () => {
    it('should strip passwordHash and __v when serialized to JSON', () => {
      const user = new User(validUserData);
      const json = user.toJSON();

      expect(json.passwordHash).toBeUndefined();
      expect(json.__v).toBeUndefined();
      expect(json.name).toBe(validUserData.name);
      expect(json.email).toBe(validUserData.email);
    });

    it('should strip passwordHash and __v when converted to object', () => {
      const user = new User(validUserData);
      const obj = user.toObject();

      expect(obj.passwordHash).toBeUndefined();
      expect(obj.__v).toBeUndefined();
    });

    it('should transform into safe IUserSummary via toUserSummary() without passwordHash', () => {
      const user = new User(validUserData);
      const summary = user.toUserSummary();

      expect(summary.id).toBe(user._id.toString());
      expect(summary.name).toBe(validUserData.name);
      expect(summary.email).toBe(validUserData.email);
      expect(summary.phone).toBe(validUserData.phone);
      expect(summary.role).toBe(UserRole.CUSTOMER);
      expect(summary.isActive).toBe(true);
      expect(summary.createdAt).toBeDefined();
      expect((summary as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('Schema Index Declarations', () => {
    it('should declare a unique index on email', () => {
      const indexes = User.schema.indexes();
      const emailIndex = indexes.find(
        ([fields, options]) => fields.email === 1 && options?.unique === true
      );

      expect(emailIndex).toBeDefined();
    });
  });
});
