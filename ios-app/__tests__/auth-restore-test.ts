import { AppError } from '@/api/errors';
import { restoreSession } from '@/auth/restoreSession';
import type { UserDTO } from '@/contracts/user';

const userDTO: UserDTO = {
  id: 'user-1',
  displayName: 'Avery',
  avatarUrl: null,
  email: 'avery@example.com',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function storageWithToken(token: string | null) {
  return {
    saveToken: jest.fn(),
    getToken: jest.fn().mockResolvedValue(token),
    removeToken: jest.fn().mockResolvedValue(undefined),
  };
}

describe('restoreSession', () => {
  it('returns unauthenticated when no token exists', async () => {
    const storage = storageWithToken(null);
    const usersApi = { getCurrentUser: jest.fn() };

    await expect(restoreSession(storage, usersApi)).resolves.toMatchObject({
      status: 'unauthenticated',
      user: null,
    });
    expect(usersApi.getCurrentUser).not.toHaveBeenCalled();
  });

  it('loads the current user when a token exists', async () => {
    const storage = storageWithToken('valid-token');
    const usersApi = { getCurrentUser: jest.fn().mockResolvedValue(userDTO) };

    await expect(restoreSession(storage, usersApi)).resolves.toMatchObject({
      status: 'authenticated',
      user: { id: 'user-1', name: 'Avery' },
    });
  });

  it('removes an invalid token and returns unauthenticated', async () => {
    const storage = storageWithToken('expired-token');
    const usersApi = {
      getCurrentUser: jest.fn().mockRejectedValue(new AppError('UNAUTHORIZED', 401)),
    };

    await expect(restoreSession(storage, usersApi)).resolves.toMatchObject({
      status: 'unauthenticated',
      user: null,
    });
    expect(storage.removeToken).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid token on a recoverable network failure', async () => {
    const storage = storageWithToken('valid-token');
    const usersApi = {
      getCurrentUser: jest.fn().mockRejectedValue(new AppError('NETWORK_ERROR')),
    };

    await expect(restoreSession(storage, usersApi)).resolves.toMatchObject({
      status: 'unknown',
      error: { code: 'NETWORK_ERROR' },
    });
    expect(storage.removeToken).not.toHaveBeenCalled();
  });
});
