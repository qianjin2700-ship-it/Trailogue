export type {
  ApiDataResponse,
  ApiErrorCode,
  ApiErrorResponse,
  ApiListResponse,
} from '@trailogue/contracts';

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

