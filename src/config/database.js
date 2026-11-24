import pg from 'pg';

export function createDatabase(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    application_name: 'fitinity-community-api',
  });
  pool.on('error', () => console.error('Uma conexão ociosa com o PostgreSQL foi encerrada.'));
  return pool;
}
