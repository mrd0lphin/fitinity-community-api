import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

async function walk(directory) {
  const items = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(items.map((item) => item.isDirectory()
    ? walk(path.join(directory, item.name))
    : [path.join(directory, item.name)]));
  return nested.flat();
}

try {
  const files = (await Promise.all(['src', 'scripts', 'tests'].map(walk))).flat().filter((name) => name.endsWith('.js'));
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `Sintaxe inválida: ${file}`);
  }
  await SwaggerParser.validate('docs/openapi.json');
  for (const file of (await walk('postman')).filter((name) => name.endsWith('.json'))) {
    JSON.parse(await readFile(file, 'utf8'));
  }
  console.log(`Sintaxe validada em ${files.length} arquivos JavaScript. OpenAPI e JSONs do Postman válidos.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
