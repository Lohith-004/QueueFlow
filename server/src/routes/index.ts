import { Router } from 'express';
import type { EnvConfig } from '../config/env.js';
import { createHealthRouter } from './health.routes.js';
import { createAuthRouter } from './auth.routes.js';

export function createApiRouter(env: EnvConfig): Router {
  const router = Router();

  // Mount health check endpoints (/api/v1/health)
  router.use(createHealthRouter(env));

  // Mount authentication endpoints (/api/v1/auth/*)
  router.use('/auth', createAuthRouter(env));

  return router;
}
