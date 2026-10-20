import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/index.js';

test('loadConfig rejects missing server secrets at startup', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'test' }), /DATABASE_URL/);
});

test('loadConfig parses a complete local environment', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: '3100',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/trailogue_test',
    APP_BASE_URL: 'http://localhost:3100',
    APPLE_BUNDLE_ID: 'com.example.trailogue',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    SESSION_TTL_SECONDS: '60',
  });

  assert.equal(config.PORT, 3100);
  assert.equal(config.SESSION_TTL_SECONDS, 60);
});

test('loadConfig accepts the staging runtime environment', () => {
  const config = loadConfig({
    NODE_ENV: 'staging',
    PORT: '3000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/trailogue_staging',
    APP_BASE_URL: 'https://trailogue-staging.example.com',
    APPLE_BUNDLE_ID: 'com.qianjin2700.trailogue',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  });

  assert.equal(config.NODE_ENV, 'staging');
});
