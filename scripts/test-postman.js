import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/config/database.js';
import { startEmbeddedDatabase } from './embedded-db.js';
import { migrate } from './migrate.js';

let directory;
let embedded;
let db;
let server;
try {
  directory = await mkdtemp(path.join(tmpdir(), 'fitinity-postman-'));
  embedded = await startEmbeddedDatabase({ directory, database: 'fitinity_postman_test' });
  db = createDatabase(embedded.url);
  await migrate(db);
  const { rows: [{ version }] } = await db.query('SELECT version()');
  const uploadDir = path.join(directory, 'uploads');
  const fixtureDir = path.join(directory, 'fixtures');
  await mkdir(fixtureDir);
  await mkdir(uploadDir);
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#267950' } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#4558cc' } }).jpeg().toBuffer();
  const oversized = Buffer.alloc(5242881);
  png.copy(oversized);
  const fixtures = {
    valid: { name: 'valid.png', type: 'image/png', bytes: png },
    replacement: { name: 'replacement.jpg', type: 'image/jpeg', bytes: jpeg },
    incompatible: { name: 'invalid.txt', type: 'text/plain', bytes: Buffer.from('Arquivo de teste incompatível.') },
    fake: { name: 'fake.png', type: 'image/png', bytes: Buffer.from('Este conteúdo não é uma imagem.') },
    oversized: { name: 'oversized.png', type: 'image/png', bytes: oversized },
  };
  for (const fixture of Object.values(fixtures)) {
    fixture.path = path.join(fixtureDir, fixture.name);
    await writeFile(fixture.path, fixture.bytes);
  }

  const collection = JSON.parse(await readFile(new URL('../postman/Fitinity.postman_collection.json', import.meta.url), 'utf8'));
  const environment = JSON.parse(await readFile(new URL('../postman/Fitinity.local.postman_environment.json', import.meta.url), 'utf8'));
  function assignFiles(items) {
    for (const item of items) {
      if (item.item) assignFiles(item.item);
      for (const field of item.request?.body?.formdata ?? []) {
        if (field.type !== 'file') continue;
        const fixture = /incompatível/iu.test(item.name) ? fixtures.incompatible
          : /falso/iu.test(item.name) ? fixtures.fake
            : /acima/iu.test(item.name) ? fixtures.oversized
              : /substituir/iu.test(item.name) ? fixtures.replacement : fixtures.valid;
        field.src = fixture.path;
        field.contentType = fixture.type;
      }
    }
  }
  assignFiles(collection.item);
  server = createApp({
    db,
    config: {
      nodeEnv: 'test',
      jwtSecret: randomBytes(48).toString('hex'),
      jwtExpiresIn: '1h',
      bcryptRounds: 4,
      maxUploadBytes: 5242880,
      uploadDir,
    },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  environment.values.find((variable) => variable.key === 'base_url').value = baseUrl;
  const collectionPath = path.join(directory, 'collection.json');
  const environmentPath = path.join(directory, 'environment.json');
  const rawReportPath = path.join(directory, 'raw-report.json');
  await writeFile(collectionPath, JSON.stringify(collection));
  await writeFile(environmentPath, JSON.stringify(environment));
  const require = createRequire(import.meta.url);
  const cliRequire = createRequire(require.resolve('postman-cli/package.json'));
  const packages = {
    'darwin-arm64': 'pm-bin-macos-arm64', 'darwin-x64': 'pm-bin-macos-x64',
    'linux-x64': 'pm-bin-linux-x64', 'linux-arm64': 'pm-bin-linux-arm64',
    'win32-x64': 'pm-bin-windows-x64',
  };
  const platformPackage = packages[`${process.platform}-${process.arch}`];
  if (!platformPackage) throw new Error('Postman CLI indisponível para esta plataforma. Use a coleção na interface do Postman.');
  const binaryName = process.platform === 'win32' ? 'postman.exe' : 'postman';
  const cliPath = cliRequire.resolve(`@postman/${platformPackage}/bin/${binaryName}`);
  const cliEnv = { ...process.env, NO_COLOR: '1' };
  delete cliEnv.POSTMAN_API_KEY;
  console.log('Executando coleção Postman completa em PostgreSQL e API temporários isolados.');
  const runner = spawn(cliPath, [
    'collection', 'run', collectionPath, '-e', environmentPath,
    '-r', 'cli,json', '--reporter-json-export', rawReportPath,
    '--reporter-json-structure', 'newman', '--reporter-json-omitAllHeadersAndBody',
    '--timeout-request', '15000', '--report-events=false',
  ], { stdio: 'inherit', env: cliEnv });
  const interrupt = () => runner.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let code;
  try {
    [code] = await once(runner, 'exit');
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  const summary = JSON.parse(await readFile(rawReportPath, 'utf8'));
  const report = {
    executed_at: new Date().toISOString(),
    timezone: 'America/Sao_Paulo',
    command: 'npm run test:postman -- --report',
    database: version,
    isolated_database: true,
    requests: { total: summary.run.stats.requests.total, failed: summary.run.stats.requests.failed },
    assertions: { total: summary.run.stats.assertions.total, failed: summary.run.stats.assertions.failed },
    failures: summary.run.failures.map((failure) => ({
      request: failure.source?.name,
      message: failure.error?.message,
    })),
    note: 'Coleção executada pelo Postman CLI, sem operar a interface gráfica do Postman. Tokens e respostas não são exportados.',
  };
  if (process.argv.includes('--report')) {
    await writeFile(new URL('../docs/evidencias-postman.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (code !== 0 || summary.run.failures.length) process.exitCode = 1;
} catch (error) {
  console.error(`Falha na validação Postman: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) {
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await db?.end();
  await embedded?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
}
