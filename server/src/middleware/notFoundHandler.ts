import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '@queueflow/shared';

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  };

  res.status(404).json(response);
}
