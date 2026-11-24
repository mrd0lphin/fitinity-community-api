import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabase } from '../src/config/database.js';

const migrationsDir = fileURLToPath(new URL('../database/migrations/', import.meta.url));

export async function migrate(db, log = console.log) {
  const client = await db.connect();
  try {
    // Evita aplicar a mesma migração simultaneamente em dois processos.
    await client.query('SELECT pg_advisory_lock(624153291)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = await readFile(path.join(migrationsDir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`A migração ${name} já aplicada foi alterada. Crie uma nova migração.`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
        log(`Migração aplicada: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(624153291)').catch(() => {});
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let db;
  try {
    if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env.');
    db = createDatabase(process.env.DATABASE_URL);
    await migrate(db);
    console.log('Banco de dados atualizado.');
  } catch (error) {
    console.error(`Falha na migração: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
}
