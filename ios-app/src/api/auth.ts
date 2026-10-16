import type { AppleSignInRequestDTO, AuthSessionDTO } from '@/contracts/auth';

import type { ApiClient } from './client';

export interface AuthApi {
  signInWithApple(credential: AppleSignInRequestDTO): Promise<AuthSessionDTO>;
}

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    signInWithApple(credential) {
      return client.request<AuthSessionDTO>('/v1/auth/apple', {
        method: 'POST',
        body: credential,
        authenticated: false,
      });
    },
  };
}

