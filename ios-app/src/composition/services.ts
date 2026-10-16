import { createAuthApi } from '@/api/auth';
import { createApiClient } from '@/api/client';
import { createTripsApi } from '@/api/trips';
import { createUsersApi } from '@/api/users';
import { authStorage } from '@/services/authStorage';

export const apiClient = createApiClient({ getToken: () => authStorage.getToken() });
export const authApi = createAuthApi(apiClient);
export const usersApi = createUsersApi(apiClient);
export const tripsApi = createTripsApi(apiClient);

