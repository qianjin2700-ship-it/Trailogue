import assert from 'node:assert/strict';
import test from 'node:test';

import { loadApiConfig, loadConfig } from '../src/index.js';

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

test('loadApiConfig accepts the staging R2 environment and applies upload defaults', () => {
  const config = loadApiConfig({
    NODE_ENV: 'staging',
    PORT: '3000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/trailogue_staging',
    APP_BASE_URL: 'https://trailogue-staging.example.com',
    APPLE_BUNDLE_ID: 'com.qianjin2700.trailogue',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    R2_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    R2_BUCKET: 'trailogue-staging',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    DEEPSEEK_MODEL: 'deepseek-flash',
  });

  assert.equal(config.NODE_ENV, 'staging');
  assert.equal(config.PHOTO_MAX_BYTES, 15 * 1024 * 1024);
});

test('loadApiConfig rejects a missing R2 secret', () => {
  assert.throws(() => loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/trailogue_test',
    APP_BASE_URL: 'http://localhost:3000',
    APPLE_BUNDLE_ID: 'com.example.trailogue',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    R2_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    R2_BUCKET: 'trailogue-test',
    R2_ACCESS_KEY_ID: 'test-access-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    DEEPSEEK_MODEL: 'deepseek-flash',
  }), /R2_SECRET_ACCESS_KEY/);
});
