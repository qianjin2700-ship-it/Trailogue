import { loadApiConfig } from '@trailogue/config';
import {
  createDatabase,
  PhotoRepository,
  SessionRepository,
  TripRepository,
  UserRepository,
} from '@trailogue/database';

import { buildApp } from './app.js';
import { AppleJwksIdentityVerifier } from './modules/auth/appleIdentityVerifier.js';
import { PostgresAppleUserResolver } from './modules/auth/appleUserResolver.js';
import { TrailogueAuthenticationService } from './modules/auth/authService.js';
import { SessionService } from './modules/auth/sessionService.js';
import { PhotoService } from './modules/photos/photoService.js';
import { R2PhotoStorage } from './modules/photos/r2PhotoStorage.js';

const config = loadApiConfig();
const database = createDatabase(config.DATABASE_URL);
const sessions = new SessionService(
  new SessionRepository(database.executor),
  config.SESSION_SECRET,
  config.SESSION_TTL_SECONDS,
);
const authentication = new TrailogueAuthenticationService(
  new AppleJwksIdentityVerifier(config.APPLE_BUNDLE_ID),
  new PostgresAppleUserResolver(database.withTransaction),
  sessions,
);
const trips = new TripRepository(database.executor);
const photoStorage = new R2PhotoStorage(config.R2_BUCKET, {
  endpoint: config.R2_ENDPOINT,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
});
const photos = new PhotoService({
  photos: new PhotoRepository(database.executor),
  trips,
  storage: photoStorage,
  maxBytes: config.PHOTO_MAX_BYTES,
  uploadUrlTtlSeconds: config.R2_UPLOAD_URL_TTL_SECONDS,
  readUrlTtlSeconds: config.R2_READ_URL_TTL_SECONDS,
});
const app = await buildApp({
  readiness: database,
  services: {
    authentication,
    sessions,
    users: new UserRepository(database.executor),
    trips,
    photos,
  },
  logger: {
    level: config.NODE_ENV === 'development' || config.NODE_ENV === 'test' ? 'debug' : 'info',
    redact: ['req.headers.authorization'],
  },
});

const shutdown = async () => {
  await app.close();
  await database.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: '0.0.0.0', port: config.PORT });
