import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiResponse } from '@queueflow/shared';
import type { EnvConfig } from '../config/env.js';

export interface HealthData {
  status: string;
  timezone: string;
}

export function createHealthRouter(env: EnvConfig): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    const response: ApiResponse<HealthData> = {
      success: true,
      data: {
        status: 'healthy',
        timezone: env.BUSINESS_TIMEZONE,
      },
      message: 'System operational',
    };

    res.status(200).json(response);
  });

  return router;
}
