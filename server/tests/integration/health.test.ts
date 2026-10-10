import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { EnvConfig } from '../../src/config/env.js';

describe('Health Endpoint Integration (GET /api/v1/health)', () => {
  const mockEnv: EnvConfig = {
    NODE_ENV: 'test',
    PORT: 5000,
    MONGO_URI: 'mongodb://localhost:27017/queueflow_test',
    JWT_SECRET: 'test_jwt_secret_with_more_than_thirty_two_characters_minimum',
    CLIENT_URL: 'http://localhost:5173',
    BUSINESS_TIMEZONE: 'UTC',
  };

  it('should return HTTP 200 with standard operational status and configured timezone', async () => {
    const app = createApp(mockEnv);

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'healthy',
        timezone: 'UTC',
      },
      message: 'System operational',
    });
  });

  it('should reflect a non-UTC configured business timezone correctly', async () => {
    const customTimezoneEnv: EnvConfig = {
      ...mockEnv,
      BUSINESS_TIMEZONE: 'America/New_York',
    };
    const app = createApp(customTimezoneEnv);

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.data.timezone).toBe('America/New_York');
  });
});
