import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { UserRole } from '@queueflow/shared';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Session } from '../../src/models/Session.js';
import { signJwt } from '../../src/utils/jwt.js';
import type { EnvConfig } from '../../src/config/env.js';

describe('Authentication & Session Integration Tests (POST /api/v1/auth/*, GET /api/v1/auth/me)', () => {
  const testDbUri = 'mongodb://localhost:27017/queueflow_test_auth_integration';

  const testEnv: EnvConfig = {
    PORT: 5099,
    NODE_ENV: 'test',
    MONGO_URI: testDbUri,
    JWT_SECRET: 'super_secret_test_jwt_key_minimum_32_characters_for_testing',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  const app = createApp(testEnv);

  beforeAll(async () => {
    // Connect to isolated test database
    await mongoose.connect(testDbUri);
  });

  afterAll(async () => {
    // Drop test database and close connection cleanly
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    // Clean collections before each test for deterministic state
    await User.deleteMany({});
    await Session.deleteMany({});
  });

  describe('POST /api/v1/auth/register', () => {
    const validRegistrationPayload = {
      name: 'Elena Rostova',
      email: 'Elena.Rostova@example.com',
      phone: '555-0199',
      password: 'SecurePassword123!',
    };

    it('should successfully register a customer, enforce CUSTOMER role, set HttpOnly cookie, and return HTTP 201', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegistrationPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Registration successful');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('elena.rostova@example.com'); // Lowercase normalized
      expect(response.body.data.user.role).toBe(UserRole.CUSTOMER);
      expect(response.body.data.user.passwordHash).toBeUndefined(); // No password leak

      // Verify HttpOnly cookie header
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const tokenCookie = Array.isArray(cookies)
        ? cookies.find((c) => c.startsWith('token='))
        : cookies;
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
      expect(tokenCookie).toContain('SameSite=Lax');

      // Verify persistent record in MongoDB
      const savedUser = await User.findOne({ email: 'elena.rostova@example.com' }).select(
        '+passwordHash'
      );
      expect(savedUser).not.toBeNull();
      expect(savedUser?.role).toBe(UserRole.CUSTOMER);
      expect(savedUser?.passwordHash).toMatch(/^\$2[aby]\$12\$/); // Cost factor 12

      // Verify session created in MongoDB
      const savedSession = await Session.findOne({ userId: savedUser?._id });
      expect(savedSession).not.toBeNull();
      expect(savedSession?.isValid).toBe(true);
    });

    it('should strictly reject role injection attempts with HTTP 400 VALIDATION_ERROR', async () => {
      const maliciousPayload = {
        ...validRegistrationPayload,
        role: 'ADMIN', // Privilege escalation attempt
      };

      const response = await request(app).post('/api/v1/auth/register').send(maliciousPayload);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      // Verify no user was created
      const count = await User.countDocuments();
      expect(count).toBe(0);
    });

    it('should reject invalid payload (short password, invalid email) with HTTP 400 VALIDATION_ERROR', async () => {
      const invalidPayload = {
        name: 'A', // Too short
        email: 'not-an-email',
        phone: '123', // Too short
        password: 'short', // Too short
      };

      const response = await request(app).post('/api/v1/auth/register').send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toBeDefined();
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });

    it('should reject duplicate email registration with HTTP 409 EMAIL_ALREADY_EXISTS', async () => {
      // 1. Initial registration
      await request(app).post('/api/v1/auth/register').send(validRegistrationPayload);

      // 2. Duplicate registration attempt with mixed casing
      const duplicateResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegistrationPayload,
          name: 'Another User',
          email: 'elena.rostova@example.com',
        });

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Pre-register a test user
      await request(app).post('/api/v1/auth/register').send({
        name: 'Elena Rostova',
        email: 'elena@example.com',
        phone: '555-0199',
        password: 'SecurePassword123!',
      });
    });

    it('should successfully log in with valid credentials and issue session/cookie', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'Elena@Example.com', // Case-insensitive login
        password: 'SecurePassword123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data.user.email).toBe('elena@example.com');
      expect(response.body.data.user.role).toBe(UserRole.CUSTOMER);

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('should return generic HTTP 401 UNAUTHORIZED for wrong password without creating a session', async () => {
      const sessionCountBefore = await Session.countDocuments();

      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'elena@example.com',
        password: 'WrongPassword999!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid email or password.');

      const sessionCountAfter = await Session.countDocuments();
      expect(sessionCountAfter).toBe(sessionCountBefore); // No new session
    });

    it('should return generic HTTP 401 UNAUTHORIZED for nonexistent email', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'SomePassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid email or password.');
    });
  });

  describe('GET /api/v1/auth/me (Protected Profile)', () => {
    let authCookie: string;
    let registeredUser: { email: string; name: string };

    beforeEach(async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        name: 'Elena Rostova',
        email: 'elena@example.com',
        phone: '555-0199',
        password: 'SecurePassword123!',
      });

      const cookies = regRes.headers['set-cookie'];
      authCookie = Array.isArray(cookies) ? cookies[0] : cookies;
      registeredUser = regRes.body.data.user;
    });

    it('should return safe user profile for authenticated request without passwordHash', async () => {
      const response = await request(app).get('/api/v1/auth/me').set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(registeredUser.email);
      expect(response.body.data.user.name).toBe(registeredUser.name);
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it('should reject unauthenticated request with HTTP 401 UNAUTHORIZED', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject malformed token with HTTP 401 UNAUTHORIZED', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', 'token=malformed.token.value');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject expired token with HTTP 401 TOKEN_EXPIRED', async () => {
      const expiredToken = jwt.sign(
        {
          userId: new mongoose.Types.ObjectId().toString(),
          email: 'user@example.com',
          role: UserRole.CUSTOMER,
          sessionId: new mongoose.Types.ObjectId().toString(),
        },
        testEnv.JWT_SECRET,
        { expiresIn: '-10s' }
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `token=${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject tampered token (invalid signature) with HTTP 401 UNAUTHORIZED', async () => {
      const tamperedToken = signJwt(
        {
          userId: new mongoose.Types.ObjectId().toString(),
          email: 'user@example.com',
          role: UserRole.CUSTOMER,
          sessionId: new mongoose.Types.ObjectId().toString(),
        },
        'different_tampered_secret_key_32_characters_long'
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `token=${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject token with invalid non-ObjectId sessionId with HTTP 401 UNAUTHORIZED', async () => {
      const invalidSessionToken = signJwt(
        {
          userId: new mongoose.Types.ObjectId().toString(),
          email: 'user@example.com',
          role: UserRole.CUSTOMER,
          sessionId: 'not-a-valid-mongodb-object-id',
        },
        testEnv.JWT_SECRET
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `token=${invalidSessionToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return HTTP 404 NOT_FOUND if authenticated user profile is deleted from database', async () => {
      // Delete the registered user from database while keeping session intact
      await User.deleteMany({});

      const response = await request(app).get('/api/v1/auth/me').set('Cookie', authCookie);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/auth/logout & Session Revocation', () => {
    let authCookie: string;
    let rawJwtToken: string;
    let savedSessionId: string;

    beforeEach(async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        name: 'Elena Rostova',
        email: 'elena@example.com',
        phone: '555-0199',
        password: 'SecurePassword123!',
      });

      const cookies = regRes.headers['set-cookie'];
      authCookie = Array.isArray(cookies) ? cookies[0] : cookies;

      // Extract raw token string from cookie
      const match = authCookie.match(/token=([^;]+)/);
      rawJwtToken = match ? match[1] : '';

      const session = await Session.findOne();
      savedSessionId = session?._id.toString() || '';
    });

    it('should reject unauthenticated logout request with HTTP 401 UNAUTHORIZED', async () => {
      const response = await request(app).post('/api/v1/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should invalidate session in MongoDB, clear cookie, and reject subsequent copied JWT reuse with HTTP 401 SESSION_REVOKED', async () => {
      // 1. Submit logout request
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', authCookie);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.message).toBe('Logged out successfully');

      // Verify cookie cleared in headers (expires in past / empty)
      const clearCookie = logoutResponse.headers['set-cookie'];
      expect(clearCookie).toBeDefined();

      // Verify MongoDB session was atomically marked isValid: false
      const updatedSession = await Session.findById(savedSessionId);
      expect(updatedSession?.isValid).toBe(false);

      // 2. Scenario 1.5: Attack simulation — Attacker presents the copied raw JWT after logout
      const reusedJwtResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `token=${rawJwtToken}`);

      // Must be rejected with 401 SESSION_REVOKED
      expect(reusedJwtResponse.status).toBe(401);
      expect(reusedJwtResponse.body.success).toBe(false);
      expect(reusedJwtResponse.body.error.code).toBe('SESSION_REVOKED');

      // Also verify via Authorization header
      const reusedHeaderResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${rawJwtToken}`);

      expect(reusedHeaderResponse.status).toBe(401);
      expect(reusedHeaderResponse.body.error.code).toBe('SESSION_REVOKED');
    });
  });

  describe('Transport Policy & Precedence (Cookie vs Bearer Header)', () => {
    let validToken: string;

    beforeEach(async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        name: 'Elena Rostova',
        email: 'elena@example.com',
        phone: '555-0199',
        password: 'SecurePassword123!',
      });

      const cookies = regRes.headers['set-cookie'];
      const authCookie = Array.isArray(cookies) ? cookies[0] : cookies;
      const match = authCookie.match(/token=([^;]+)/);
      validToken = match ? match[1] : '';
    });

    it('should authenticate via Authorization: Bearer when no cookie is present', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('elena@example.com');
    });

    it('should prioritize HttpOnly cookie over Authorization header when both are provided', async () => {
      // Cookie is valid, header is tampered/invalid
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `token=${validToken}`)
        .set('Authorization', 'Bearer invalid.tampered.token');

      // Succeeds because valid cookie takes precedence
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
