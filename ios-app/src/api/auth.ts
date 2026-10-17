import type { ApiDataResponse } from '@/contracts/common';
import type { AppleSignInRequest, AuthSessionDTO } from '@/contracts/auth';

import type { ApiClient } from './client';

export interface AuthApi {
  signInWithApple(credential: AppleSignInRequest): Promise<AuthSessionDTO>;
}

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    async signInWithApple(credential) {
      const response = await client.request<ApiDataResponse<AuthSessionDTO>>('/v1/auth/apple', {
        method: 'POST',
        body: credential,
        authenticated: false,
      });
      return response.data;
    },
  };
}

