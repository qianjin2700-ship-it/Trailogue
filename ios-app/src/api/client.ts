import type { ApiEnvelope } from '@/contracts/common';

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
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetchImplementation(`${normalizedBaseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        const envelope = await parseEnvelope<T>(response);
        if (!response.ok) {
          throw new AppError(mapHttpStatus(response.status), response.status);
        }
        if (envelope.code !== 0) {
          throw new AppError(mapBackendCode(envelope.code), response.status);
        }

        return envelope.data as T;
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

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    const value = (await response.json()) as Partial<ApiEnvelope<T>>;
    if (typeof value.code !== 'number') throw new Error('Missing API envelope code');
    return value as ApiEnvelope<T>;
  } catch (error) {
    if (!response.ok) throw new AppError(mapHttpStatus(response.status), response.status, error);
    throw new AppError('UNKNOWN', response.status, error);
  }
}

