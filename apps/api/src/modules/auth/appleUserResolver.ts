import {
  IdentityRepository,
  UserRepository,
  type QueryExecutor,
  type UserRecord,
} from '@trailogue/database';

type TransactionRunner = <T>(operation: (executor: QueryExecutor) => Promise<T>) => Promise<T>;

export interface AppleUserResolver {
  resolve(input: {
    providerUserId: string;
    email: string | null;
    displayName: string | null;
  }): Promise<UserRecord>;
}

export class PostgresAppleUserResolver implements AppleUserResolver {
  constructor(private readonly withTransaction: TransactionRunner) {}

  async resolve(input: {
    providerUserId: string;
    email: string | null;
    displayName: string | null;
  }): Promise<UserRecord> {
    return this.withTransaction(async (executor) => {
      const identities = new IdentityRepository(executor);
      const users = new UserRepository(executor);
      await identities.lockProviderSubject('apple', input.providerUserId);

      const existingIdentity = await identities.findByProviderSubject(
        'apple',
        input.providerUserId,
      );
      if (existingIdentity) {
        const existingUser = await users.findById(existingIdentity.userId);
        if (!existingUser) throw new Error('Apple identity references a missing user');
        return existingUser;
      }

      const newUser = await users.create({ displayName: input.displayName, email: input.email });
      await identities.create({
        userId: newUser.id,
        provider: 'apple',
        providerUserId: input.providerUserId,
        email: input.email,
      });
      return newUser;
    });
  }
}
