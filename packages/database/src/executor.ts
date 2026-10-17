import type { Pool, PoolClient, QueryResultRow } from 'pg';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface QueryExecutor {
  query<T>(text: string, parameters?: readonly unknown[]): Promise<QueryResult<T>>;
}

export class PgQueryExecutor implements QueryExecutor {
  constructor(private readonly client: Pool | PoolClient) {}

  async query<T>(text: string, parameters: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.client.query<T & QueryResultRow>(text, [...parameters]);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }
}
