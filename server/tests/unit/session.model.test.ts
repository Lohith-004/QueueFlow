import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Session } from '../../src/models/Session.js';

describe('Session Model (server/src/models/Session.ts)', () => {
  const validSessionData = {
    userId: new mongoose.Types.ObjectId(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ipAddress: '127.0.0.1',
  };

  it('should successfully validate a complete session document', async () => {
    const session = new Session(validSessionData);
    const err = await session.validate().catch((e: unknown) => e);

    expect(err).toBeUndefined();
    expect(session.isValid).toBe(true); // Default
    expect(session.userId.toString()).toBe(validSessionData.userId.toString());
  });

  it('should default isValid to true when omitted', () => {
    const session = new Session(validSessionData);
    expect(session.isValid).toBe(true);
  });

  it('should allow explicitly marking session isValid to false for revocation', async () => {
    const session = new Session({
      ...validSessionData,
      isValid: false,
    });
    const err = await session.validate().catch((e: unknown) => e);

    expect(err).toBeUndefined();
    expect(session.isValid).toBe(false);
  });

  it('should require userId and expiresAt', async () => {
    const emptySession = new Session({});
    const err = (await emptySession
      .validate()
      .catch((e: unknown) => e)) as mongoose.Error.ValidationError;

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.userId).toBeDefined();
    expect(err.errors.expiresAt).toBeDefined();
  });

  it('should allow optional audit telemetry (userAgent and ipAddress)', async () => {
    const minimalSession = new Session({
      userId: new mongoose.Types.ObjectId(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    const err = await minimalSession.validate().catch((e: unknown) => e);

    expect(err).toBeUndefined();
    expect(minimalSession.userAgent).toBeUndefined();
    expect(minimalSession.ipAddress).toBeUndefined();
  });

  describe('Schema Index Declarations', () => {
    it('should declare a TTL index on expiresAt with expireAfterSeconds: 0', () => {
      const indexes = Session.schema.indexes();
      const ttlIndex = indexes.find(
        ([fields, options]) => fields.expiresAt === 1 && options?.expireAfterSeconds === 0
      );

      expect(ttlIndex).toBeDefined();
    });

    it('should declare a compound index on {_id: 1, isValid: 1} for authGuard queries', () => {
      const indexes = Session.schema.indexes();
      const compoundIndex = indexes.find(([fields]) => fields._id === 1 && fields.isValid === 1);

      expect(compoundIndex).toBeDefined();
    });
  });
});
