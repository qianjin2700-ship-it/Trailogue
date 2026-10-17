import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { AppError } from '@/api/errors';
import type { AppleSignInRequest } from '@/contracts/auth';

export class AppleSignInCancelledError extends Error {
  constructor() {
    super('Apple sign-in was cancelled.');
    this.name = 'AppleSignInCancelledError';
  }
}

export async function getAppleCredential(): Promise<AppleSignInRequest> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new AppError('UNKNOWN');
  }

  const nonce = Crypto.randomUUID();
  const state = Crypto.randomUUID();

  try {
    const credential = await AppleAuthentication.signInAsync({
      nonce,
      state,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken || credential.state !== state) {
      throw new AppError('UNKNOWN');
    }

    return {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      nonce,
      profile: {
        givenName: credential.fullName?.givenName ?? null,
        familyName: credential.fullName?.familyName ?? null,
        email: credential.email,
      },
    };
  } catch (error) {
    if (isAppleCancellation(error)) throw new AppleSignInCancelledError();
    if (error instanceof AppError) throw error;
    throw new AppError('UNKNOWN', undefined, error);
  }
}

function isAppleCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_REQUEST_CANCELED'
  );
}

