import { createHash, timingSafeEqual } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');
const MAX_IDENTITY_TOKEN_LENGTH = 16_384;

export interface VerifiedAppleIdentity {
  providerUserId: string;
  email: string | null;
}

export interface AppleIdentityVerifier {
  verify(input: {
    identityToken: string;
    authorizationCode: string | null;
    nonce: string;
  }): Promise<VerifiedAppleIdentity>;
}

export class InvalidAppleIdentityError extends Error {
  constructor() {
    super('Apple identity token is invalid');
    this.name = 'InvalidAppleIdentityError';
  }
}

export class AppleJwksIdentityVerifier implements AppleIdentityVerifier {
  constructor(
    private readonly audience: string,
    private readonly keyResolver: JWTVerifyGetKey = createRemoteJWKSet(APPLE_JWKS_URL, {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 3_600_000,
    }),
  ) {}

  async verify(input: {
    identityToken: string;
    authorizationCode: string | null;
    nonce: string;
  }): Promise<VerifiedAppleIdentity> {
    if (
      input.identityToken.length === 0 ||
      input.identityToken.length > MAX_IDENTITY_TOKEN_LENGTH ||
      input.nonce.length < 16 ||
      input.nonce.length > 256
    ) {
      throw new InvalidAppleIdentityError();
    }

    try {
      const { payload } = await jwtVerify(input.identityToken, this.keyResolver, {
        issuer: APPLE_ISSUER,
        audience: this.audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'nonce', 'iat', 'exp'],
      });

      if (!secureEqual(payload.nonce, input.nonce)) throw new InvalidAppleIdentityError();
      if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 255) {
        throw new InvalidAppleIdentityError();
      }
      if (payload.email !== undefined && typeof payload.email !== 'string') {
        throw new InvalidAppleIdentityError();
      }

      return {
        providerUserId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
      };
    } catch (error) {
      if (error instanceof InvalidAppleIdentityError) throw error;
      throw new InvalidAppleIdentityError();
    }
  }
}

function secureEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string') return false;
  const actualDigest = createHash('sha256').update(actual).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}
