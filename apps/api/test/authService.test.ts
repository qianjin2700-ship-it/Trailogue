import assert from 'node:assert/strict';
import test from 'node:test';

import type { UserRecord } from '@trailogue/database';

import { TrailogueAuthenticationService } from '../src/modules/auth/authService.js';
import { SessionService } from '../src/modules/auth/sessionService.js';

test('Apple sign-in resolves the verified identity and creates an opaque session', async () => {
  const now = new Date('2026-10-18T00:00:00.000Z');
  const user: UserRecord = {
    id: '10000000-0000-4000-8000-000000000001',
    displayName: 'Trail Ogue',
    avatarUrl: null,
    email: 'verified@example.com',
    createdAt: now,
    updatedAt: now,
  };
  let resolvedInput: unknown;
  let storedTokenHash = '';
  const service = new TrailogueAuthenticationService(
    {
      verify: async () => ({ providerUserId: 'apple-subject', email: 'verified@example.com' }),
    },
    {
      resolve: async (input) => {
        resolvedInput = input;
        return user;
      },
    },
    new SessionService(
      {
        create: async (input) => {
          storedTokenHash = input.tokenHash;
          return {
            id: '20000000-0000-4000-8000-000000000002',
            userId: input.userId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
            createdAt: now,
            lastUsedAt: now,
          };
        },
        findActiveByTokenHash: async () => null,
        revoke: async () => true,
      },
      'test-session-secret-at-least-32-characters',
      3_600,
    ),
  );

  const result = await service.signInWithApple({
    identityToken: 'signed-token',
    authorizationCode: null,
    nonce: '0123456789abcdef0123456789abcdef',
    profile: { givenName: ' Trail ', familyName: ' Ogue ', email: 'untrusted@example.com' },
  });

  assert.deepEqual(resolvedInput, {
    providerUserId: 'apple-subject',
    email: 'verified@example.com',
    displayName: 'Trail Ogue',
  });
  assert.equal(result.user, user);
  assert.match(result.accessToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(storedTokenHash, result.accessToken);
  assert.equal(storedTokenHash.length, 64);
});
