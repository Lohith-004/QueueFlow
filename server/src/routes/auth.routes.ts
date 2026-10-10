import { Router } from 'express';
import { registerSchema, loginSchema } from '@queueflow/shared';
import type { EnvConfig } from '../config/env.js';
import { validateBody } from '../middleware/validate.js';
import { createAuthGuard } from '../middleware/authGuard.js';
import * as authController from '../controllers/auth.controller.js';

/**
 * Creates authentication router mounting endpoints at /api/v1/auth.
 *
 * Endpoints:
 * - POST /register: Public customer registration with strict payload validation
 * - POST /login: User login issuing server-side session and HttpOnly JWT cookie
 * - POST /logout: Revokes active session in MongoDB and clears auth cookie
 * - GET /me: Returns safe authenticated user summary
 *
 * @param env - Application environment configuration
 * @returns Configured Express Router
 */
export function createAuthRouter(env: EnvConfig): Router {
  const router = Router();
  const authGuard = createAuthGuard(env);

  // POST /api/v1/auth/register
  router.post('/register', validateBody(registerSchema), authController.register);

  // POST /api/v1/auth/login
  router.post('/login', validateBody(loginSchema), authController.login);

  // POST /api/v1/auth/logout
  router.post('/logout', authGuard, authController.logout);

  // GET /api/v1/auth/me
  router.get('/me', authGuard, authController.getMe);

  return router;
}
