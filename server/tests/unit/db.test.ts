import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import {
  sanitizeMongoUri,
  connectDatabase,
  closeDatabaseConnection,
  getDatabaseState,
  setupGracefulShutdown,
  resetShutdownHookState,
} from '../../src/config/db.js';

describe('MongoDB Lifecycle & Retry Policy (db.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetShutdownHookState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sanitizeMongoUri', () => {
    it('should mask passwords in connection strings containing credentials', () => {
      const uriWithAuth = 'mongodb://mockUser:mockPassword123@localhost:27017/queueflow';
      const sanitized = sanitizeMongoUri(uriWithAuth);

      expect(sanitized).not.toContain('mockPassword123');
      expect(sanitized).toContain('mockUser:***@localhost:27017/queueflow');
    });

    it('should return connection strings without passwords unmodified', () => {
      const localUri = 'mongodb://localhost:27017/queueflow';
      expect(sanitizeMongoUri(localUri)).toBe(localUri);
    });
  });

  describe('connectDatabase', () => {
    it('should successfully establish connection on first attempt', async () => {
      const mockConnect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

      const result = await connectDatabase({
        uri: 'mongodb://localhost:27017/queueflow',
        maxRetries: 3,
        retryDelayMs: 10,
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(result).toBe(mongoose);
    });

    it('should retry on failure and succeed if subsequent attempt passes', async () => {
      const mockConnect = vi
        .spyOn(mongoose, 'connect')
        .mockRejectedValueOnce(new Error('Network connection timeout'))
        .mockResolvedValueOnce(mongoose);

      const result = await connectDatabase({
        uri: 'mongodb://localhost:27017/queueflow',
        maxRetries: 3,
        retryDelayMs: 10,
      });

      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(result).toBe(mongoose);
    });

    it('should exhaust all retries and throw error when connection fails persistently', async () => {
      const mockConnect = vi
        .spyOn(mongoose, 'connect')
        .mockRejectedValue(new Error('Connection refused'));

      await expect(
        connectDatabase({
          uri: 'mongodb://localhost:27017/queueflow',
          maxRetries: 3,
          retryDelayMs: 10,
        })
      ).rejects.toThrow(/Failed to connect to MongoDB after 3 attempts/);

      expect(mockConnect).toHaveBeenCalledTimes(3);
    });
  });

  describe('closeDatabaseConnection & getDatabaseState', () => {
    it('should map Mongoose readyState correctly', () => {
      // Mock readyState property
      vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
      expect(getDatabaseState()).toBe('connected');

      vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
      expect(getDatabaseState()).toBe('disconnected');
    });

    it('should close connection cleanly when readyState is not 0', async () => {
      vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
      const mockClose = vi.spyOn(mongoose.connection, 'close').mockResolvedValue();

      await closeDatabaseConnection();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('setupGracefulShutdown', () => {
    it('should register process signal listeners without duplicating hooks', () => {
      const onceSpy = vi.spyOn(process, 'once');

      setupGracefulShutdown();
      const callCountAfterFirst = onceSpy.mock.calls.length;

      expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      // Second invocation should be a no-op
      setupGracefulShutdown();
      expect(onceSpy.mock.calls.length).toBe(callCountAfterFirst);
    });
  });
});
