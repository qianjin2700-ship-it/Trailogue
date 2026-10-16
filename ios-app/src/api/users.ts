import type { UserDTO } from '@/contracts/user';

import type { ApiClient } from './client';

export interface UsersApi {
  getCurrentUser(): Promise<UserDTO>;
}

export function createUsersApi(client: ApiClient): UsersApi {
  return {
    getCurrentUser() {
      return client.request<UserDTO>('/v1/users/me');
    },
  };
}

