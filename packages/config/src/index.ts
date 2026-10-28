import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url(),
  APP_BASE_URL: z.string().url(),
  APPLE_BUNDLE_ID: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
});

const apiEnvironmentSchema = environmentSchema.extend({
  R2_ENDPOINT: z.string().url(),
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  R2_READ_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
  PHOTO_MAX_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024).default(15 * 1024 * 1024),
  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_BASE_URL: z.string().url(),
  DEEPSEEK_MODEL: z.string().min(1),
});

export type AppConfig = z.infer<typeof environmentSchema>;
export type ApiConfig = z.infer<typeof apiEnvironmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiEnvironmentSchema.parse(environment);
}
