import { createDatabase } from '../client.js';
import { seedDevelopmentData } from '../seedData.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed is disabled in production');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const database = createDatabase(databaseUrl);

try {
  const { user } = await seedDevelopmentData(database.executor);
  console.log(`Development seed completed for user ${user.id}.`);
} finally {
  await database.close();
}
