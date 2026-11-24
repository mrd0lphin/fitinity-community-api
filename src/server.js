import { mkdir } from 'node:fs/promises';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDatabase } from './config/database.js';

let db;
try {
  const config = loadConfig();
  db = createDatabase(config.databaseUrl);
  await db.query('SELECT 1');
  await db.query('SELECT id FROM users LIMIT 0');
  await mkdir(config.uploadDir, { recursive: true });
  const server = createApp({ db, config }).listen(config.port, config.host, () => {
    console.log(`API Fitinity: http://${config.host}:${config.port}`);
    console.log(`Swagger: http://${config.host}:${config.port}/docs`);
  });
  server.on('error', async (error) => {
    console.error(`Não foi possível iniciar o servidor (${error.code || 'erro de rede'}).`);
    await db.end();
    process.exitCode = 1;
  });
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await db.end();
      clearTimeout(timeout);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Falha na inicialização: ${error.message}`);
  if (error.code === '42P01') console.error('Execute npm run db:migrate antes de iniciar a API.');
  await db?.end();
  process.exitCode = 1;
}
