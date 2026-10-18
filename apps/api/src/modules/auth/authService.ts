import type { AppleSignInRequest } from '@trailogue/contracts';
import type { UserRecord } from '@trailogue/database';

import type { AppleIdentityVerifier } from './appleIdentityVerifier.js';
import type { AppleUserResolver } from './appleUserResolver.js';
import type { SessionService } from './sessionService.js';

export interface AuthenticationResult {
  accessToken: string;
  expiresAt: Date;
  user: UserRecord;
}

export interface AuthenticationService {
  signInWithApple(input: AppleSignInRequest): Promise<AuthenticationResult>;
}

export class TrailogueAuthenticationService implements AuthenticationService {
  constructor(
    private readonly appleVerifier: AppleIdentityVerifier,
    private readonly users: AppleUserResolver,
    private readonly sessions: SessionService,
  ) {}

  async signInWithApple(input: AppleSignInRequest): Promise<AuthenticationResult> {
    const identity = await this.appleVerifier.verify(input);
    const displayName = normalizeDisplayName(input.profile.givenName, input.profile.familyName);

    const user = await this.users.resolve({
      providerUserId: identity.providerUserId,
      email: identity.email,
      displayName,
    });

    const { token, session } = await this.sessions.create(user.id);
    return { accessToken: token, expiresAt: session.expiresAt, user };
  }
}

function normalizeDisplayName(givenName: string | null, familyName: string | null): string | null {
  const value = [givenName, familyName]
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 160);
  return value || null;
}
