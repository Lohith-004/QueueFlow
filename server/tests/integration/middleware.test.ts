import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/utils/AppError.js';
import type { EnvConfig } from '../../src/config/env.js';

describe('Express Middleware Pipeline & Security Infrastructure', () => {
  const mockEnv: EnvConfig = {
    NODE_ENV: 'test',
    PORT: 5000,
    MONGO_URI: 'mongodb://localhost:27017/queueflow_test',
    JWT_SECRET: 'test_jwt_secret_with_more_than_thirty_two_characters_minimum',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  it('should return HTTP 400 with VALIDATION_ERROR when sent malformed JSON', async () => {
    const app = createApp(mockEnv);

    // Send broken JSON string directly
    const response = await request(app)
      .post('/api/v1/health') // any endpoint
      .set('Content-Type', 'application/json')
      .send('{ "brokenJson": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload in request body',
      },
    });
  });

  it('should return HTTP 404 with NOT_FOUND for non-existent routes', async () => {
    const app = createApp(mockEnv);

    const response = await request(app).get('/api/v1/non-existent-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found: GET /api/v1/non-existent-route',
      },
    });
  });

  it('should enforce CORS headers matching CLIENT_URL with credentials enabled', async () => {
    const app = createApp(mockEnv);

    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('should attach Helmet security headers to HTTP responses', async () => {
    const app = createApp(mockEnv);

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('should translate custom AppError instances into standard API error envelopes', async () => {
    const app = createApp(mockEnv, (testApp) => {
      testApp.get('/test-operational-error', () => {
        throw new AppError(403, 'FORBIDDEN_RESOURCE', 'Access to this resource is prohibited', [
          { field: 'id', message: 'Resource is private' },
        ]);
      });
    });

    const response = await request(app).get('/test-operational-error');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'FORBIDDEN_RESOURCE',
        message: 'Access to this resource is prohibited',
        details: [{ field: 'id', message: 'Resource is private' }],
      },
    });
  });

  it('should never expose stack traces or internal implementation details on unexpected errors', async () => {
    const app = createApp(mockEnv, (testApp) => {
      testApp.get('/test-internal-error', () => {
        throw new Error('Unexpected database socket disconnect');
      });
    });

    const response = await request(app).get('/test-internal-error');

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    // Stack trace must never be returned in API response
    expect(response.body.error).not.toHaveProperty('stack');
  });
});
