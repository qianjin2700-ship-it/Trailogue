import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { PgQueryExecutor } from './executor.js';
import { schema } from './schema.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    drizzle: drizzle(pool, { schema }),
    executor: new PgQueryExecutor(pool),
    async healthCheck() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    },
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
