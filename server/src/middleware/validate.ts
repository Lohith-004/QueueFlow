import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import type { ApiErrorDetail } from '@queueflow/shared';
import { AppError } from '../utils/AppError.js';

/**
 * Express middleware factory to validate incoming request bodies against a Zod schema.
 * Formats validation failures into standard AppError (HTTP 400 VALIDATION_ERROR) with field details.
 *
 * @param schema - Zod schema to validate req.body against
 * @returns Express request handler
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details: ApiErrorDetail[] = result.error.issues.map((issue) => {
        let field: string | undefined = issue.path.join('.');
        if (
          (!field || field.length === 0) &&
          issue.code === 'unrecognized_keys' &&
          'keys' in issue
        ) {
          field = (issue as { keys: string[] }).keys.join(', ');
        }

        return {
          field: field && field.length > 0 ? field : undefined,
          message: issue.message,
        };
      });

      return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    }

    // Assign sanitized and parsed data back to req.body
    req.body = result.data;
    next();
  };
}
