import { AppError } from '@/api/errors';
import type { UsersApi } from '@/api/users';
import { mapUserDTO, type User } from '@/domain/user/user';
import type { AuthStorage } from '@/services/authStorage';

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

export type RestoredAuthState =
  | { status: 'authenticated'; user: User; error: null }
  | { status: 'unauthenticated'; user: null; error: null }
  | { status: 'unknown'; user: null; error: AppError };

export async function restoreSession(
  storage: AuthStorage,
  usersApi: Pick<UsersApi, 'getCurrentUser'>
): Promise<RestoredAuthState> {
  const token = await storage.getToken();
  if (!token) return { status: 'unauthenticated', user: null, error: null };

  try {
    const user = mapUserDTO(await usersApi.getCurrentUser());
    return { status: 'authenticated', user, error: null };
  } catch (error) {
    if (error instanceof AppError && error.code === 'UNAUTHORIZED') {
      await storage.removeToken();
      return { status: 'unauthenticated', user: null, error: null };
    }

    return {
      status: 'unknown',
      user: null,
      error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
    };
  }
}

