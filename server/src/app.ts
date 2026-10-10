import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { EnvConfig } from './config/env.js';
import { getEnv } from './config/env.js';
import { createApiRouter } from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(
  envConfig?: EnvConfig,
  mountCustomRoutes?: (app: Express) => void
): Express {
  const env = envConfig ?? getEnv();
  const app = express();

  // 1. Helmet security headers
  app.use(helmet());

  // 2. CORS restricted to validated CLIENT_URL with credentials
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    })
  );

  // 3. HTTP-only cookie parser
  app.use(cookieParser());

  // 4. Request body JSON parser with strict size limit
  app.use(express.json({ limit: '10kb' }));

  // 5. API v1 routes
  app.use('/api/v1', createApiRouter(env));

  // Mount custom routes if provided (used in integration tests to trigger operational/internal errors)
  if (mountCustomRoutes) {
    mountCustomRoutes(app);
  }

  // 6. Not-found handler (404)
  app.use(notFoundHandler);

  // 7. Centralized error handler
  app.use(errorHandler);

  return app;
}
