import { loadConfig } from '@trailogue/config';
import {
  createDatabase,
  SessionRepository,
  TripRepository,
  UserRepository,
} from '@trailogue/database';

import { buildApp } from './app.js';
import { AppleJwksIdentityVerifier } from './modules/auth/appleIdentityVerifier.js';
import { PostgresAppleUserResolver } from './modules/auth/appleUserResolver.js';
import { TrailogueAuthenticationService } from './modules/auth/authService.js';
import { SessionService } from './modules/auth/sessionService.js';

const config = loadConfig();
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
const app = await buildApp({
  readiness: database,
  services: {
    authentication,
    sessions,
    users: new UserRepository(database.executor),
    trips: new TripRepository(database.executor),
  },
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
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
