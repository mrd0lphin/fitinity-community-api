import EmbeddedPostgres from 'embedded-postgres';
import { access, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

export function availablePort(preferred = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(preferred, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function startEmbeddedDatabase({ directory, database, port = 0, persistent = false }) {
  const selectedPort = await availablePort(port);
  const dataDir = path.join(directory, 'data');
  const socketDir = path.join(directory, 'socket');
  await mkdir(socketDir, { recursive: true });
  let diagnostic = '';
  const cluster = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: selectedPort,
    user: 'fitinity',
    password: 'fitinity_local_only',
    authMethod: 'scram-sha-256',
    persistent,
    createPostgresUser: false,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-k', socketDir, '-c', 'max_connections=30'],
    onLog: (message) => { diagnostic = `${diagnostic}\n${String(message)}`.slice(-3000); },
    onError: (message) => { diagnostic = `${diagnostic}\n${String(message)}`.slice(-3000); },
  });
  let stopping;
  let starting = true;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    if (!starting) void stop().catch(() => {});
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  function stop() {
    stopping ??= (async () => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      // O pacote espera pelo evento exit; não o aguarde se ele já ocorreu.
      const child = cluster.process;
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      await cluster.stop();
    })();
    return stopping;
  }
  try {
    const initialized = await access(path.join(dataDir, 'PG_VERSION')).then(() => true).catch(() => false);
    if (!initialized) await cluster.initialise();
    if (interrupted) throw new Error('Inicialização interrompida.');
    await cluster.start();
    const client = cluster.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
      if (!result.rowCount) await cluster.createDatabase(database);
    } finally {
      await client.end();
    }
    if (interrupted) throw new Error('Inicialização interrompida.');
    starting = false;
  } catch (error) {
    await stop().catch(() => {});
    throw new Error(`Não foi possível iniciar PostgreSQL local: ${error?.message || 'processo encerrado antes de ficar pronto'}\n${diagnostic}`, { cause: error });
  }
  return {
    url: `postgresql://fitinity:fitinity_local_only@127.0.0.1:${selectedPort}/${database}`,
    stop,
  };
}
