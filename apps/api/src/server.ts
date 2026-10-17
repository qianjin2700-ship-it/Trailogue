import { loadConfig } from '@trailogue/config';
import { createDatabase } from '@trailogue/database';

import { buildApp } from './app.js';

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
const app = await buildApp({
  readiness: database,
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
