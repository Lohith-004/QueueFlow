import { Router } from 'express';
import type { EnvConfig } from '../config/env.js';
import { createHealthRouter } from './health.routes.js';

export function createApiRouter(env: EnvConfig): Router {
  const router = Router();

  // Mount health check endpoints
  router.use(createHealthRouter(env));

  return router;
}
