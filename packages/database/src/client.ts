import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { PgQueryExecutor } from './executor.js';
import type { QueryExecutor } from './executor.js';
import { schema } from './schema.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    drizzle: drizzle(pool, { schema }),
    executor: new PgQueryExecutor(pool),
    async healthCheck() {
      await pool.query('select 1');
    },
    async withTransaction<T>(operation: (executor: QueryExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await operation(new PgQueryExecutor(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
