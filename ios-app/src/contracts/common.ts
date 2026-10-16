export interface ApiEnvelope<T> {
  code: number;
  data?: T;
  message?: string;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

