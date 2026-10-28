export type ApiErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

const USER_MESSAGES: Record<ApiErrorCode, string> = {
  CONFIGURATION_ERROR: 'The service is not configured yet.',
  NETWORK_ERROR: 'Check your connection and try again.',
  TIMEOUT: 'The request took too long. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have access to this item.',
  NOT_FOUND: 'This item could not be found.',
  INVALID_REQUEST: 'Some information is not valid. Review your entries and try again.',
  CONFLICT: 'This request cannot be completed yet. Check the required details and try again.',
  SERVER_ERROR: 'The service is unavailable right now. Please try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(code: ApiErrorCode, status?: number, cause?: unknown) {
    super(USER_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function mapHttpStatus(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 409) return 'CONFLICT';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

export function mapBackendCode(code: string): ApiErrorCode {
  if (code === 'UNAUTHORIZED' || code === 'INVALID_APPLE_TOKEN') return 'UNAUTHORIZED';
  if (code === 'FORBIDDEN') return 'FORBIDDEN';
  if (code === 'NOT_FOUND') return 'NOT_FOUND';
  if (code === 'VALIDATION_ERROR') return 'INVALID_REQUEST';
  if (code === 'CONFLICT') return 'CONFLICT';
  if (code === 'INTERNAL_ERROR') return 'SERVER_ERROR';
  return 'UNKNOWN';
}

