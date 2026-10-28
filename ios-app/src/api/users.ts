import type { UpdateUserSettingsRequest, UserDTO } from '@/contracts/user';
import type { ApiDataResponse } from '@/contracts/common';

import type { ApiClient } from './client';

export interface UsersApi {
  getCurrentUser(): Promise<UserDTO>;
  updateSettings(input: UpdateUserSettingsRequest): Promise<UserDTO>;
  deleteAccount(): Promise<void>;
}

export function createUsersApi(client: ApiClient): UsersApi {
  return {
    async getCurrentUser() {
      const response = await client.request<ApiDataResponse<UserDTO>>('/v1/users/me');
      return response.data;
    },
    async updateSettings(input) {
      return (await client.request<ApiDataResponse<UserDTO>>('/v1/users/me', {
        method: 'PATCH', body: input,
      })).data;
    },
    async deleteAccount() {
      await client.request('/v1/users/me', {
        method: 'DELETE', body: { confirmation: 'DELETE' }, timeoutMs: 60_000,
      });
    },
  };
}

