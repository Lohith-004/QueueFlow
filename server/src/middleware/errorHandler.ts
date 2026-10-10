import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import type { ApiErrorResponse, ApiErrorCode } from '@queueflow/shared';
import { AppError } from '../utils/AppError.js';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let code: ApiErrorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details: ApiErrorResponse['error']['details'] = undefined;

  // 1. Handle body-parser JSON syntax error (Malformed JSON)
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status: unknown }).status === 400 &&
    'body' in err
  ) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Malformed JSON payload in request body';
  }
  // 2. Handle custom operational AppError
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // 3. Handle unexpected internal errors safely
  else if (err instanceof Error) {
    console.error('[Unhandled Error]:', err);
    if (process.env.NODE_ENV !== 'production') {
      message = err.message || 'Internal server error';
    }
  } else {
    console.error('[Unknown Error]:', err);
  }

  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  res.status(statusCode).json(errorResponse);
};
