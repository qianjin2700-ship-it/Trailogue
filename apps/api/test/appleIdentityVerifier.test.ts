import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import {
  AppleJwksIdentityVerifier,
  InvalidAppleIdentityError,
} from '../src/modules/auth/appleIdentityVerifier.js';

const audience = 'com.trailogue.test';
const issuer = 'https://appleid.apple.com';
const nonce = '0123456789abcdef0123456789abcdef';

async function createFixture() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const keyResolver = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key', use: 'sig' }],
  });
  const verifier = new AppleJwksIdentityVerifier(audience, keyResolver);

  async function sign(overrides: {
    audience?: string;
    expiresAt?: number;
    nonce?: string;
  } = {}) {
    const now = Math.floor(Date.now() / 1_000);
    return new SignJWT({
      nonce: overrides.nonce ?? nonce,
      email: 'traveler@example.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(overrides.audience ?? audience)
      .setSubject('apple-user-123')
      .setIssuedAt(now)
      .setExpirationTime(overrides.expiresAt ?? now + 300)
      .sign(privateKey);
  }

  return { sign, verifier };
}

test('verifies a signed Apple identity token and returns trusted claims', async () => {
  const { sign, verifier } = await createFixture();

  const identity = await verifier.verify({
    identityToken: await sign(),
    authorizationCode: null,
    nonce,
  });

  assert.deepEqual(identity, {
    providerUserId: 'apple-user-123',
    email: 'traveler@example.com',
  });
});

test('rejects an identity token when nonce, audience, or expiry is invalid', async (context) => {
  const { sign, verifier } = await createFixture();
  const now = Math.floor(Date.now() / 1_000);
  const cases = [
    { name: 'nonce', token: await sign({ nonce: 'fedcba9876543210fedcba9876543210' }) },
    { name: 'audience', token: await sign({ audience: 'com.example.other' }) },
    { name: 'expiry', token: await sign({ expiresAt: now - 1 }) },
  ];

  for (const item of cases) {
    await context.test(item.name, async () => {
      await assert.rejects(
        verifier.verify({ identityToken: item.token, authorizationCode: null, nonce }),
        InvalidAppleIdentityError,
      );
    });
  }
});
