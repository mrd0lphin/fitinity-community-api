import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../src/config/database.js';
import { migrate } from './migrate.js';
import { startEmbeddedDatabase } from './embedded-db.js';

function validateTestUrl(raw) {
  const url = new URL(raw);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^[a-z0-9_]+_test$/i.test(name)) {
    throw new Error('TEST_DATABASE_URL deve usar PostgreSQL e um banco dedicado com nome terminado em _test.');
  }
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL);
    if (decodeURIComponent(dev.pathname.slice(1)) === name) {
      throw new Error('O nome do banco de teste deve ser diferente do banco de desenvolvimento.');
    }
  }
  return raw;
}

let embedded;
let directory;
let db;
let child;
try {
  directory = await mkdtemp(path.join(tmpdir(), 'fitinity-test-'));
  let url;
  if (process.env.TEST_DATABASE_URL) {
    url = validateTestUrl(process.env.TEST_DATABASE_URL);
    console.log('Testando no PostgreSQL externo dedicado, informado por TEST_DATABASE_URL.');
  } else {
    embedded = await startEmbeddedDatabase({ directory, database: 'fitinity_test' });
    url = embedded.url;
    console.log('PostgreSQL real temporário iniciado para testes (fitinity_test).');
  }
  db = createDatabase(url);
  await migrate(db);
  const version = await db.query('SELECT version()');
  console.log(version.rows[0].version);
  await db.end();
  db = null;
  const files = (await readdir('tests')).filter((name) => name.endsWith('.test.js')).sort();
  if (!files.length) throw new Error('Nenhum arquivo de teste encontrado.');
  child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files.map((name) => `tests/${name}`)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: url,
      JWT_SECRET: randomBytes(48).toString('hex'),
      UPLOAD_DIR: path.join(directory, 'uploads'),
    },
  });
  const stopChild = (signal) => child.kill(signal);
  process.once('SIGINT', stopChild);
  process.once('SIGTERM', stopChild);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    process.removeListener('SIGINT', stopChild);
    process.removeListener('SIGTERM', stopChild);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db?.end();
  await embedded?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
}
