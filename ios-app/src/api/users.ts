import type { UserDTO } from '@/contracts/user';
import type { ApiDataResponse } from '@/contracts/common';

import type { ApiClient } from './client';

export interface UsersApi {
  getCurrentUser(): Promise<UserDTO>;
}

export function createUsersApi(client: ApiClient): UsersApi {
  return {
    async getCurrentUser() {
      const response = await client.request<ApiDataResponse<UserDTO>>('/v1/users/me');
      return response.data;
    },
  };
}

