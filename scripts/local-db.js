import 'dotenv/config';
import path from 'node:path';
import { startEmbeddedDatabase } from './embedded-db.js';

let database;
try {
  const port = Number(process.env.LOCAL_DB_PORT || 54329);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LOCAL_DB_PORT inválida.');
  database = await startEmbeddedDatabase({
    directory: path.resolve('.local/postgres'),
    database: 'fitinity',
    port,
    persistent: true,
  });
  console.log(`PostgreSQL local pronto. Configure no .env:\nDATABASE_URL=${database.url}`);
  console.log('Mantenha este terminal aberto. Ctrl+C encerra o banco e preserva os dados.');
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    await database.stop();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
