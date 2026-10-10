export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_STATE_TRANSITION'
  | 'APPOINTMENT_ALREADY_CHECKED_IN'
  | 'UNAUTHORIZED'
  | 'SESSION_REVOKED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN_INSUFFICIENT_PERMISSIONS'
  | 'FORBIDDEN_RESOURCE'
  | 'NOT_FOUND'
  | 'SLOT_ALREADY_BOOKED'
  | 'TICKET_ALREADY_CLAIMED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_SERVER_ERROR'
  | 'UNAUTHORIZED_ROOM';

export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}
