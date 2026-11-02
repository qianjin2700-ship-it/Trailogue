import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeKeyPrefix, R2PhotoStorage } from '../src/modules/photos/r2PhotoStorage.js';

const key = 'users/u1/trips/t1/photos/p1/original.jpg';
const credentials = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
};

test('normalizeKeyPrefix keeps staging behaviour and isolates production objects', () => {
  assert.equal(normalizeKeyPrefix(undefined), '');
  assert.equal(normalizeKeyPrefix(''), '');
  assert.equal(normalizeKeyPrefix('  /  '), '');
  assert.equal(normalizeKeyPrefix('production'), 'production/');
  assert.equal(normalizeKeyPrefix('/production/'), 'production/');
  assert.equal(normalizeKeyPrefix('prod/2026'), 'prod/2026/');
});

test('a prefixed storage signs URLs under the production prefix only', async () => {
  const production = new R2PhotoStorage('trailogue-photos', {
    ...credentials,
    keyPrefix: 'production',
  });
  const staging = new R2PhotoStorage('trailogue-photos', credentials);

  const productionUrl = await production.createUploadUrl({
    key,
    contentType: 'image/jpeg',
    expiresInSeconds: 300,
  });
  const stagingUrl = await staging.createUploadUrl({
    key,
    contentType: 'image/jpeg',
    expiresInSeconds: 300,
  });
  const productionRead = await production.createReadUrl(key, 600);

  assert.ok(productionUrl.includes('production/users/u1/trips'), productionUrl);
  assert.ok(!stagingUrl.includes('production/'), stagingUrl);
  assert.ok(stagingUrl.includes('users/u1/trips'), stagingUrl);
  assert.ok(productionRead.includes('production/users/u1/trips'), productionRead);
  // 签名参数存在，说明仍是私有直读的预签名地址，而不是公开对象。
  assert.match(productionRead, /X-Amz-Signature=/);
});
