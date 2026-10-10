import type { ApiErrorCode, ApiErrorDetail } from '@queueflow/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: ApiErrorDetail[];
  public readonly isOperational: boolean;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
