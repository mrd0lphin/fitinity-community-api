import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/_test$/i.test(decodeURIComponent(new URL(databaseUrl).pathname))) {
  throw new Error('TEST_DATABASE_URL deve apontar para um banco separado cujo nome termine em _test. Execute npm test.');
}
if (databaseUrl === process.env.DATABASE_URL) {
  throw new Error('Os testes não podem utilizar o mesmo DATABASE_URL do desenvolvimento.');
}

const db = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const secret = 'fitinity-integration-tests-only-secret-2026';
const password = 'SenhaSegura123!';
let app;
let uploadDir;
let png;
let jpeg;
let webp;

async function register(email = 'alice@example.com', name = 'Alice Silva') {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password })
    .expect(201);
  return response.body.data;
}

async function login(email = 'alice@example.com') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return response.body.data.token;
}

async function user(email = 'alice@example.com', name = 'Alice Silva') {
  const profile = await register(email, name);
  const token = await login(email);
  return { ...profile, token };
}

function authenticated(method, route, token) {
  return request(app)[method](route).set('Authorization', `Bearer ${token}`);
}

async function createPost(token, content = 'Hoje completei meu treino!') {
  const response = await authenticated('post', '/api/posts', token)
    .send({ content })
    .expect(201);
  return response.body.data;
}

function expectError(response, code) {
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, 'string');
  assert.ok(response.body.error.message.length > 0);
  assert.equal(response.body.error.stack, undefined);
  assert.equal(response.body.stack, undefined);
}

async function files() {
  return (await readdir(uploadDir)).sort();
}

function onDisk(url) {
  assert.match(url, /^\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i);
  return path.join(uploadDir, path.basename(url));
}

describe('API Fitinity Community — integração com PostgreSQL real', { concurrency: false }, () => {
  before(async () => {
    await db.query('SELECT 1 FROM users LIMIT 1');
    uploadDir = await mkdtemp(path.join(tmpdir(), 'fitinity-test-uploads-'));
    [png, jpeg, webp] = await Promise.all([
      sharp({ create: { width: 3, height: 3, channels: 4, background: '#34a853' } }).png().toBuffer(),
      sharp({ create: { width: 3, height: 3, channels: 3, background: '#34a853' } }).jpeg().toBuffer(),
      sharp({ create: { width: 3, height: 3, channels: 4, background: '#34a853' } }).webp().toBuffer(),
    ]);
    app = createApp({
      db,
      config: {
        jwtSecret: secret,
        jwtExpiresIn: '1h',
        uploadDir,
        maxUploadBytes: 5 * 1024 * 1024,
        bcryptRounds: 4,
        port: 0,
        host: '127.0.0.1',
        nodeEnv: 'test',
      },
    });
  });

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE comments, likes, posts, users RESTART IDENTITY CASCADE');
    if (uploadDir) {
      for (const entry of await readdir(uploadDir)) {
        await rm(path.join(uploadDir, entry), { recursive: true, force: true });
      }
    }
  });

  after(async () => {
    await db.end();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it('expõe a verificação de saúde sem exigir autenticação', async () => {
    await request(app).get('/health').expect(200);
  });

  it('cadastra usuário, normaliza e-mail e persiste apenas o hash bcrypt', async () => {
    const profile = await register('  ALICE@Example.COM  ', 'Alice Silva');
    assert.equal(profile.name, 'Alice Silva');
    assert.equal(profile.email, 'alice@example.com');
    assert.ok(profile.id > 0);
    assert.equal(profile.password, undefined);
    assert.equal(profile.password_hash, undefined);
    const { rows: [saved] } = await db.query('SELECT * FROM users WHERE id = $1', [profile.id]);
    assert.notEqual(saved.password_hash, password);
    assert.match(saved.password_hash, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare(password, saved.password_hash), true);
  });

  it('impede e-mails duplicados inclusive quando a capitalização muda', async () => {
    await register();
    const response = await request(app).post('/api/auth/register')
      .send({ name: 'Outra Alice', email: 'ALICE@EXAMPLE.COM', password })
      .expect(409);
    expectError(response, 'CONFLICT');
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM users')).rows[0].count, 1);
  });

  it('valida os campos do cadastro e o limite de 72 bytes do bcrypt', async () => {
    const invalid = [
      { name: 'A', email: 'a@example.com', password },
      { name: 'Alice', email: 'email-invalido', password },
      { name: 'Alice', email: 'a@example.com', password: '1234567' },
      { name: 'Alice', email: 'a@example.com', password: 'á'.repeat(37) },
      { name: 'Alice', email: 'a@example.com' },
      { name: 'Alice\u0000Silva', email: 'a@example.com', password },
      { name: 'Alice', email: 'alice\u0000@example.com', password },
    ];
    for (const body of invalid) {
      const response = await request(app).post('/api/auth/register').send(body).expect(400);
      expectError(response, 'VALIDATION_ERROR');
    }
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM users')).rows[0].count, 0);
  });

  it('realiza login, emite JWT com expiração e rejeita credenciais incorretas', async () => {
    const profile = await register();
    const response = await request(app).post('/api/auth/login')
      .send({ email: ' ALICE@EXAMPLE.COM ', password }).expect(200);
    const decoded = jwt.verify(response.body.data.token, secret, {
      algorithms: ['HS256'], issuer: 'fitinity-api', audience: 'fitinity-community',
    });
    assert.equal(String(decoded.sub), String(profile.id));
    assert.ok(decoded.exp > decoded.iat);
    assert.equal(response.body.data.user.password_hash, undefined);
    for (const credentials of [
      { email: 'alice@example.com', password: 'SenhaErrada123!' },
      { email: 'inexistente@example.com', password },
    ]) {
      expectError(await request(app).post('/api/auth/login').send(credentials).expect(401), 'UNAUTHORIZED');
    }
  });

  it('protege rotas contra token ausente, inválido, expirado e com claims/algoritmo incorretos', async () => {
    const alice = await user();
    expectError(await request(app).get('/api/users/me').expect(401), 'UNAUTHORIZED');
    const validClaims = { subject: String(alice.id), issuer: 'fitinity-api', audience: 'fitinity-community' };
    const tokens = [
      'token-invalido',
      jwt.sign({}, secret, { ...validClaims, expiresIn: -1 }),
      jwt.sign({}, secret, { ...validClaims, issuer: 'outro-emissor', expiresIn: '1h' }),
      jwt.sign({}, secret, { ...validClaims, audience: 'outro-publico', expiresIn: '1h' }),
      jwt.sign({}, secret, { ...validClaims, algorithm: 'HS384', expiresIn: '1h' }),
      jwt.sign({}, 'outro-segredo', { ...validClaims, expiresIn: '1h' }),
    ];
    for (const token of tokens) {
      expectError(await authenticated('get', '/api/users/me', token).expect(401), 'UNAUTHORIZED');
    }
    const valid = await authenticated('get', '/api/users/me', alice.token).expect(200);
    assert.equal(valid.body.data.id, alice.id);
  });

  it('bloqueia leituras, escritas e uploads privados sem token antes de persistir dados', async () => {
    for (const [method, route] of [
      ['get', '/api/posts'],
      ['post', '/api/posts'],
      ['patch', '/api/users/me'],
      ['delete', '/api/users/me/avatar'],
    ]) {
      expectError(await request(app)[method](route).send({ content: 'Tentativa sem token' }).expect(401), 'UNAUTHORIZED');
    }
    expectError(await request(app).post('/api/users/me/avatar')
      .attach('avatar', png, { filename: 'foto.png', contentType: 'image/png' })
      .expect(401), 'UNAUTHORIZED');
    assert.deepEqual(await files(), []);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM posts')).rows[0].count, 0);
  });

  it('consulta e atualiza somente o próprio perfil e mantém unicidade do e-mail', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    const updated = await authenticated('patch', '/api/users/me', alice.token)
      .send({ name: 'Alice Atualizada', email: ' NOVO@EXAMPLE.COM ' }).expect(200);
    assert.equal(updated.body.data.id, alice.id);
    assert.equal(updated.body.data.name, 'Alice Atualizada');
    assert.equal(updated.body.data.email, 'novo@example.com');
    assert.equal(updated.body.data.password_hash, undefined);
    expectError(await authenticated('patch', '/api/users/me', alice.token)
      .send({ email: 'BOB@EXAMPLE.COM' }).expect(409), 'CONFLICT');
    const { rows: [other] } = await db.query('SELECT name, email FROM users WHERE id = $1', [bob.id]);
    assert.deepEqual(other, { name: 'Bruno Santos', email: 'bob@example.com' });
    expectError(await authenticated('patch', '/api/users/me', alice.token)
      .send({ user_id: bob.id }).expect(400), 'VALIDATION_ERROR');
  });

  it('cria, lista, consulta, edita e exclui uma publicação sem expor o hash do autor', async () => {
    const alice = await user();
    const post = await createPost(alice.token);
    assert.equal(post.user_id, alice.id);
    assert.equal(post.content, 'Hoje completei meu treino!');
    assert.equal(post.image_url, null);
    const listing = await authenticated('get', '/api/posts', alice.token).expect(200);
    assert.equal(listing.body.data.length, 1);
    assert.equal(listing.body.pagination.total, 1);
    assert.equal(JSON.stringify(listing.body).includes('password_hash'), false);
    const found = await authenticated('get', `/api/posts/${post.id}`, alice.token).expect(200);
    assert.equal(found.body.data.id, post.id);
    const updated = await authenticated('patch', `/api/posts/${post.id}`, alice.token)
      .send({ content: 'Treino e alongamento concluídos.' }).expect(200);
    assert.equal(updated.body.data.content, 'Treino e alongamento concluídos.');
    await authenticated('delete', `/api/posts/${post.id}`, alice.token).expect(204);
    expectError(await authenticated('get', `/api/posts/${post.id}`, alice.token).expect(404), 'NOT_FOUND');
  });

  it('bloqueia alterações e exclusões de publicações de outro usuário', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    const post = await createPost(alice.token);
    expectError(await authenticated('patch', `/api/posts/${post.id}`, bob.token)
      .send({ content: 'Tentativa indevida' }).expect(403), 'FORBIDDEN');
    expectError(await authenticated('delete', `/api/posts/${post.id}`, bob.token).expect(403), 'FORBIDDEN');
    const { rows: [saved] } = await db.query('SELECT content, user_id FROM posts WHERE id = $1', [post.id]);
    assert.equal(saved.user_id, alice.id);
    assert.equal(saved.content, post.content);
  });

  it('rejeita autoria injetada pelo cliente e mantém os dados recebidos como valores SQL', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    expectError(await authenticated('post', '/api/posts', alice.token)
      .send({ content: 'Tentativa de autoria', user_id: bob.id }).expect(400), 'VALIDATION_ERROR');
    const literal = "Treino'); DROP TABLE users; --";
    const post = await createPost(alice.token, literal);
    assert.equal(post.content, literal);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM users')).rows[0].count, 2);
  });

  it('pagina publicações e rejeita paginação inválida', async () => {
    const alice = await user();
    await createPost(alice.token, 'Primeiro treino');
    await createPost(alice.token, 'Segundo treino');
    await createPost(alice.token, 'Terceiro treino');
    const page = await authenticated('get', '/api/posts?page=2&limit=2', alice.token).expect(200);
    assert.equal(page.body.data.length, 1);
    assert.deepEqual(page.body.pagination, { page: 2, limit: 2, total: 3, totalPages: 2 });
    for (const query of ['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=101', 'limit=1.5']) {
      expectError(await authenticated('get', `/api/posts?${query}`, alice.token).expect(400), 'VALIDATION_ERROR');
    }
  });

  it('valida conteúdo, IDs, corpos vazios e recursos inexistentes', async () => {
    const alice = await user();
    for (const content of ['', '   ', 'a'.repeat(5001), 123, 'Treino\u0000inválido']) {
      expectError(await authenticated('post', '/api/posts', alice.token).send({ content }).expect(400), 'VALIDATION_ERROR');
    }
    for (const id of ['0', '-1', 'abc', '1.5', '2147483648']) {
      expectError(await authenticated('get', `/api/posts/${id}`, alice.token).expect(400), 'VALIDATION_ERROR');
    }
    expectError(await authenticated('get', '/api/posts/999999', alice.token).expect(404), 'NOT_FOUND');
    const post = await createPost(alice.token);
    expectError(await authenticated('patch', `/api/posts/${post.id}`, alice.token).send({}).expect(400), 'VALIDATION_ERROR');
  });

  it('cria, lista, edita e exclui comentários com controle de propriedade', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    const post = await createPost(alice.token);
    const created = await authenticated('post', `/api/posts/${post.id}/comments`, bob.token)
      .send({ content: 'Parabéns pelo treino!' }).expect(201);
    const comment = created.body.data;
    assert.equal(comment.user_id, bob.id);
    assert.equal(comment.post_id, post.id);
    const listing = await authenticated('get', `/api/posts/${post.id}/comments`, alice.token).expect(200);
    assert.equal(listing.body.data[0].id, comment.id);
    expectError(await authenticated('patch', `/api/comments/${comment.id}`, alice.token)
      .send({ content: 'Alteração indevida' }).expect(403), 'FORBIDDEN');
    expectError(await authenticated('delete', `/api/comments/${comment.id}`, alice.token).expect(403), 'FORBIDDEN');
    const updated = await authenticated('patch', `/api/comments/${comment.id}`, bob.token)
      .send({ content: 'Continue assim!' }).expect(200);
    assert.equal(updated.body.data.content, 'Continue assim!');
    await authenticated('delete', `/api/comments/${comment.id}`, bob.token).expect(204);
    expectError(await authenticated('delete', `/api/comments/${comment.id}`, bob.token).expect(404), 'NOT_FOUND');
  });

  it('valida comentários e não permite comentar em publicação inexistente', async () => {
    const alice = await user();
    const post = await createPost(alice.token);
    for (const content of ['', '   ', 'a'.repeat(2001), 'Comentário\u0000inválido']) {
      expectError(await authenticated('post', `/api/posts/${post.id}/comments`, alice.token)
        .send({ content }).expect(400), 'VALIDATION_ERROR');
    }
    expectError(await authenticated('post', '/api/posts/999999/comments', alice.token)
      .send({ content: 'Comentário' }).expect(404), 'NOT_FOUND');
    expectError(await authenticated('get', '/api/posts/999999/comments', alice.token).expect(404), 'NOT_FOUND');
  });

  it('torna curtidas idempotentes e mantém a restrição única no PostgreSQL', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    const post = await createPost(alice.token);
    await authenticated('post', `/api/posts/${post.id}/likes`, bob.token).expect(201);
    await authenticated('post', `/api/posts/${post.id}/likes`, bob.token).expect(200);
    const { rows: [count] } = await db.query('SELECT count(*)::integer AS count FROM likes WHERE post_id = $1', [post.id]);
    assert.equal(count.count, 1);
    await assert.rejects(db.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [bob.id, post.id]), { code: '23505' });
    const found = await authenticated('get', `/api/posts/${post.id}`, bob.token).expect(200);
    assert.equal(found.body.data.likes_count, 1);
    assert.equal(found.body.data.liked_by_me, true);
    await authenticated('delete', `/api/posts/${post.id}/likes`, bob.token).expect(204);
    await authenticated('delete', `/api/posts/${post.id}/likes`, bob.token).expect(204);
    expectError(await authenticated('post', '/api/posts/999999/likes', bob.token).expect(404), 'NOT_FOUND');
  });

  it('remove curtidas e comentários relacionados quando uma publicação é excluída', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    const post = await createPost(alice.token);
    await authenticated('post', `/api/posts/${post.id}/likes`, bob.token).expect(201);
    await authenticated('post', `/api/posts/${post.id}/comments`, bob.token).send({ content: 'Bom treino!' }).expect(201);
    await authenticated('delete', `/api/posts/${post.id}`, alice.token).expect(204);
    for (const table of ['comments', 'likes']) {
      const { rows: [count] } = await db.query(`SELECT count(*)::integer AS count FROM ${table} WHERE post_id = $1`, [post.id]);
      assert.equal(count.count, 0);
    }
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM users')).rows[0].count, 2);
  });

  it('aceita JPEG, PNG e WebP reais para avatar e remove arquivos substituídos', async () => {
    const alice = await user();
    let previous;
    for (const [buffer, filename, contentType] of [
      [png, 'foto.png', 'image/png'],
      [jpeg, 'foto.jpg', 'image/jpeg'],
      [webp, 'foto.webp', 'image/webp'],
    ]) {
      const response = await authenticated('post', '/api/users/me/avatar', alice.token)
        .attach('avatar', buffer, { filename, contentType }).expect(200);
      const url = response.body.data.avatar_url;
      assert.ok((await stat(onDisk(url))).size > 0);
      const served = await request(app).get(url).expect(200);
      assert.deepEqual(served.body, await readFile(onDisk(url)));
      if (previous) await assert.rejects(stat(onDisk(previous)), { code: 'ENOENT' });
      previous = url;
      assert.equal((await files()).length, 1);
    }
    await authenticated('delete', '/api/users/me/avatar', alice.token).expect(204);
    assert.deepEqual(await files(), []);
    const profile = await authenticated('get', '/api/users/me', alice.token).expect(200);
    assert.equal(profile.body.data.avatar_url, null);
    await authenticated('delete', '/api/users/me/avatar', alice.token).expect(204);
  });

  it('rejeita extensão, MIME, assinatura e conteúdo de imagem incompatíveis sem deixar arquivos', async () => {
    const alice = await user();
    for (const [buffer, filename, contentType] of [
      [Buffer.from('isto não é uma imagem'), 'foto.png', 'image/png'],
      [png, 'foto.exe', 'image/png'],
      [png, 'foto.jpg', 'image/jpeg'],
      [png, 'foto.png', 'image/jpeg'],
      [png.subarray(0, 24), 'truncada.png', 'image/png'],
    ]) {
      const response = await authenticated('post', '/api/users/me/avatar', alice.token)
        .attach('avatar', buffer, { filename, contentType }).expect(415);
      expectError(response, 'INVALID_FILE_TYPE');
      assert.deepEqual(await files(), []);
    }
  });

  it('rejeita arquivos acima de 5 MB e campos de upload inesperados', async () => {
    const alice = await user();
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    png.copy(oversized);
    expectError(await authenticated('post', '/api/users/me/avatar', alice.token)
      .attach('avatar', oversized, { filename: 'grande.png', contentType: 'image/png' })
      .expect(413), 'FILE_TOO_LARGE');
    expectError(await authenticated('post', '/api/users/me/avatar', alice.token)
      .attach('outro_campo', png, { filename: 'foto.png', contentType: 'image/png' })
      .expect(400), 'VALIDATION_ERROR');
    assert.deepEqual(await files(), []);
  });

  it('cria, substitui, remove e exclui imagens de publicações sem deixar arquivos órfãos', async () => {
    const alice = await user();
    const created = await authenticated('post', '/api/posts', alice.token)
      .field('content', 'Treino com imagem')
      .attach('image', png, { filename: 'treino.png', contentType: 'image/png' }).expect(201);
    const post = created.body.data;
    const firstImage = post.image_url;
    await stat(onDisk(firstImage));
    const replaced = await authenticated('patch', `/api/posts/${post.id}`, alice.token)
      .attach('image', jpeg, { filename: 'novo.jpg', contentType: 'image/jpeg' }).expect(200);
    assert.notEqual(replaced.body.data.image_url, firstImage);
    await assert.rejects(stat(onDisk(firstImage)), { code: 'ENOENT' });
    assert.equal((await files()).length, 1);
    const removed = await authenticated('patch', `/api/posts/${post.id}`, alice.token)
      .send({ remove_image: true }).expect(200);
    assert.equal(removed.body.data.image_url, null);
    assert.deepEqual(await files(), []);
    const imageAgain = await authenticated('patch', `/api/posts/${post.id}`, alice.token)
      .attach('image', webp, { filename: 'novo.webp', contentType: 'image/webp' }).expect(200);
    await stat(onDisk(imageAgain.body.data.image_url));
    await authenticated('delete', `/api/posts/${post.id}`, alice.token).expect(204);
    assert.deepEqual(await files(), []);
  });

  it('preserva imagem existente em alterações inválidas ou sem autorização', async () => {
    const alice = await user();
    const bob = await user('bob@example.com', 'Bruno Santos');
    const created = await authenticated('post', '/api/posts', alice.token)
      .field('content', 'Minha imagem')
      .attach('image', png, { filename: 'foto.png', contentType: 'image/png' }).expect(201);
    const post = created.body.data;
    const originalFiles = await files();
    expectError(await authenticated('patch', `/api/posts/${post.id}`, bob.token)
      .attach('image', jpeg, { filename: 'outra.jpg', contentType: 'image/jpeg' }).expect(403), 'FORBIDDEN');
    expectError(await authenticated('patch', `/api/posts/${post.id}`, alice.token)
      .field('remove_image', 'true')
      .attach('image', jpeg, { filename: 'outra.jpg', contentType: 'image/jpeg' }).expect(400), 'VALIDATION_ERROR');
    expectError(await authenticated('patch', `/api/posts/${post.id}`, alice.token)
      .attach('image', Buffer.from('arquivo falso'), { filename: 'falso.png', contentType: 'image/png' }).expect(415), 'INVALID_FILE_TYPE');
    assert.deepEqual(await files(), originalFiles);
    const found = await authenticated('get', `/api/posts/${post.id}`, alice.token).expect(200);
    assert.equal(found.body.data.image_url, post.image_url);
  });

  it('remove o novo arquivo quando o PostgreSQL rejeita a criação de publicação', async () => {
    const alice = await user();
    await db.query(`
      CREATE FUNCTION reject_test_post() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Falha controlada de persistência no teste';
      END;
      $$;
      CREATE TRIGGER reject_test_post BEFORE INSERT ON posts
      FOR EACH ROW EXECUTE FUNCTION reject_test_post();
    `);
    try {
      const response = await authenticated('post', '/api/posts', alice.token)
        .field('content', 'Falha controlada')
        .attach('image', png, { filename: 'foto.png', contentType: 'image/png' }).expect(500);
      assert.equal(typeof response.body.error.message, 'string');
      assert.equal(JSON.stringify(response.body).includes('Falha controlada de persistência'), false);
      assert.deepEqual(await files(), []);
      assert.equal((await db.query('SELECT count(*)::integer AS count FROM posts')).rows[0].count, 0);
    } finally {
      await db.query('DROP TRIGGER reject_test_post ON posts; DROP FUNCTION reject_test_post();');
    }
  });

  it('padroniza JSON inválido, rotas desconhecidas e não expõe diretórios de uploads', async () => {
    const response = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"email":').expect(400);
    expectError(response, 'VALIDATION_ERROR');
    const alice = await user();
    expectError(await authenticated('get', '/api/inexistente', alice.token).expect(404), 'NOT_FOUND');
    await request(app).get('/uploads/').expect(404);
  });
});
