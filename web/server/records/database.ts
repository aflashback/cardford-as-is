import pg from 'pg';
export const createPool = (connectionString: string) =>
  new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 });
export type Database = ReturnType<typeof createPool>;
export type Transaction = pg.PoolClient;
export async function transaction<T>(
  pool: Database,
  action: (client: Transaction) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
