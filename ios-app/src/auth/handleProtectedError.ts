import { AppError } from '@/api/errors';

export async function handleProtectedError(
  error: unknown,
  signOut: () => Promise<void>
): Promise<boolean> {
  if (!(error instanceof AppError) || error.code !== 'UNAUTHORIZED') return false;
  await signOut();
  return true;
}
