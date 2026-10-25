import type { ApiErrorResponse } from '@/contracts/common';

import { AppError, mapBackendCode, mapHttpStatus } from './errors';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type TokenProvider = () => Promise<string | null>;

interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  getToken?: TokenProvider;
  timeoutMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  headers?: Record<string, string>;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function createApiClient({
  baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL,
  fetch: fetchImplementation = globalThis.fetch,
  getToken = async () => null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ApiClientOptions = {}): ApiClient {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/$/, '');

  return {
    async request<T>(path: string, options: RequestOptions = {}) {
      if (!normalizedBaseUrl) {
        throw new AppError('CONFIGURATION_ERROR');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const token = options.authenticated === false ? null : await getToken();
        const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetchImplementation(`${normalizedBaseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        const payload = await parseJson<T>(response);
        if (!response.ok) {
          const backendCode = (payload as Partial<ApiErrorResponse>).error?.code;
          throw new AppError(
            backendCode ? mapBackendCode(backendCode) : mapHttpStatus(response.status),
            response.status,
          );
        }
        return payload;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (controller.signal.aborted) throw new AppError('TIMEOUT', undefined, error);
        throw new AppError('NETWORK_ERROR', undefined, error);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (!response.ok) throw new AppError(mapHttpStatus(response.status), response.status, error);
    throw new AppError('UNKNOWN', response.status, error);
  }
}

