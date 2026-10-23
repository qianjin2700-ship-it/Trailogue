import { AppError } from '@/api/errors';
import { handleProtectedError } from '@/auth/handleProtectedError';

describe('protected request errors', () => {
  it('clears the session after a 401', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);

    await expect(handleProtectedError(new AppError('UNAUTHORIZED', 401), signOut)).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the session after a network error', async () => {
    const signOut = jest.fn();

    await expect(handleProtectedError(new AppError('NETWORK_ERROR'), signOut)).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });
});
