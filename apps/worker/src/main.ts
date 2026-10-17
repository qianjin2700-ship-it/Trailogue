import { randomUUID } from 'node:crypto';

import { loadConfig } from '@trailogue/config';
import { createDatabase, JobRepository } from '@trailogue/database';

import { JobWorker } from './worker.js';

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
const worker = new JobWorker({
  repository: new JobRepository(database.executor),
  workerId: `worker-${randomUUID()}`,
  handler: async (job) => {
    throw new Error(`No Phase A handler is registered for job type ${job.type}`);
  },
});

const shutdown = async () => {
  worker.stop();
  await database.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await worker.start();
