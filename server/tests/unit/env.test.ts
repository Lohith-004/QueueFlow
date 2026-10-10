import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  envSchema,
  validateEnv,
  formatEnvErrors,
  getEnv,
  resetEnvCache,
} from '../../src/config/env.js';

describe('Environment Configuration Validation (env.ts)', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '5000',
    MONGO_URI: 'mongodb://localhost:27017/queueflow',
    JWT_SECRET: 'this_is_a_very_secure_jwt_secret_with_more_than_32_characters',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  beforeEach(() => {
    resetEnvCache();
  });

  it('should format Zod errors into sanitized strings via formatEnvErrors', () => {
    const parseResult = envSchema.safeParse({});
    if (!parseResult.success) {
      const messages = formatEnvErrors(parseResult.error);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]).toMatch(/\[Config Error\]/);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully parse valid environment variables', () => {
    const config = validateEnv(validEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(5000);
    expect(config.MONGO_URI).toBe('mongodb://localhost:27017/queueflow');
    expect(config.JWT_SECRET).toBe(validEnv.JWT_SECRET);
    expect(config.CLIENT_URL).toBe('http://localhost:5173');
    expect(config.BUSINESS_TIMEZONE).toBe('UTC');
  });

  it('should apply default values for PORT, NODE_ENV, and BUSINESS_TIMEZONE', () => {
    const minimalEnv = {
      MONGO_URI: 'mongodb://localhost:27017/queueflow',
      JWT_SECRET: 'a_very_long_secret_that_satisfies_thirty_two_chars_rule',
      CLIENT_URL: 'http://localhost:5173',
    };
    const config = validateEnv(minimalEnv);
    expect(config.PORT).toBe(5000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.BUSINESS_TIMEZONE).toBe('UTC');
  });

  it('should fail when MONGO_URI is missing or does not start with valid mongo prefix', () => {
    expect(() => validateEnv({ ...validEnv, MONGO_URI: undefined })).toThrow(/MONGO_URI/);

    expect(() =>
      validateEnv({ ...validEnv, MONGO_URI: 'http://localhost:27017/queueflow' })
    ).toThrow(/mongodb:\/\/ or mongodb\+srv:\/\//);
  });

  it('should fail when JWT_SECRET is less than 32 characters', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short_secret_only_24_chars' })).toThrow(
      /at least 32 characters/
    );
  });

  it('should fail when CLIENT_URL is not a valid URL', () => {
    expect(() => validateEnv({ ...validEnv, CLIENT_URL: 'not-a-valid-url' })).toThrow(
      /CLIENT_URL must be a valid URL/
    );
  });

  it('should fail when PORT is outside valid range (1 - 65535)', () => {
    expect(() => validateEnv({ ...validEnv, PORT: '0' })).toThrow(
      /PORT must be an integer between 1 and 65535/
    );

    expect(() => validateEnv({ ...validEnv, PORT: '70000' })).toThrow(
      /PORT must be an integer between 1 and 65535/
    );

    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(
      /PORT must be an integer between 1 and 65535/
    );
  });

  it('should fail when BUSINESS_TIMEZONE is an invalid timezone identifier', () => {
    expect(() =>
      validateEnv({ ...validEnv, BUSINESS_TIMEZONE: 'Invalid/NonExistent_Zone' })
    ).toThrow(/valid IANA timezone identifier/);
  });

  it('should sanitize error formatting and never leak secret values', () => {
    const superSecretAttempt = 'short';
    try {
      validateEnv({
        ...validEnv,
        JWT_SECRET: superSecretAttempt,
      });
      expect.fail('Should have thrown validation error');
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      expect(errorMsg).toContain('JWT_SECRET');
      expect(errorMsg).toContain('at least 32 characters');
      // Must not contain the actual secret string
      expect(errorMsg).not.toContain(`'${superSecretAttempt}'`);
    }
  });

  it('should terminate with exit code 1 when getEnv fails on invalid process.env', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Save and clear required vars from process.env
    const originalMongo = process.env.MONGO_URI;
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.MONGO_URI;
    delete process.env.JWT_SECRET;

    try {
      getEnv();
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      process.env.MONGO_URI = originalMongo;
      process.env.JWT_SECRET = originalSecret;
    }
  });
});
