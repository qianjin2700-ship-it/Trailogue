import { IdentityRepository, TripRepository, UserRepository } from './repositories.js';
import type { QueryExecutor } from './executor.js';

export async function seedDevelopmentData(database: QueryExecutor, suffix = Date.now().toString(36)) {
  const users = new UserRepository(database);
  const identities = new IdentityRepository(database);
  const trips = new TripRepository(database);
  const user = await users.create({ displayName: 'Trailogue Developer' });
  await identities.create({
    userId: user.id,
    provider: 'apple',
    providerUserId: `development-${suffix}`,
  });
  const trip = await trips.create({
    userId: user.id,
    title: 'Pacific Coast Test Trip',
    destinationName: 'California',
    description: 'Development seed data only.',
  });
  return { user, trip };
}
