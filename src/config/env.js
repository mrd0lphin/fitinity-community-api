import 'dotenv/config';
import path from 'node:path';
import jwt from 'jsonwebtoken';

function integer(env, name, fallback, min, max) {
  const raw = env[name] || String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Configure DATABASE_URL no arquivo .env.');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
    throw new Error('DATABASE_URL deve apontar para um banco PostgreSQL.');
  }
  const jwtSecret = env.JWT_SECRET || '';
  if (jwtSecret.length < 32 || /SUBSTITUA|CHANGE_ME|YOUR_SECRET/i.test(jwtSecret)) {
    throw new Error('Configure JWT_SECRET com um segredo aleatório de pelo menos 32 caracteres.');
  }
  const jwtExpiresIn = env.JWT_EXPIRES_IN || '1h';
  // Valida a duração com a mesma biblioteca usada na emissão do token.
  let token;
  try {
    token = jwt.decode(jwt.sign({}, jwtSecret, { expiresIn: jwtExpiresIn, algorithm: 'HS256' }));
  } catch {
    throw new Error('JWT_EXPIRES_IN inválido; utilize uma duração como 15m ou 1h.');
  }
  if (token.exp <= token.iat) throw new Error('JWT_EXPIRES_IN deve ser uma duração positiva.');

  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    host: env.HOST || '127.0.0.1',
    port: integer(env, 'PORT', 3000, 1, 65535),
    databaseUrl,
    jwtSecret,
    jwtExpiresIn,
    bcryptRounds: integer(env, 'BCRYPT_ROUNDS', 10, 4, 14),
    uploadDir: path.resolve(env.UPLOAD_DIR || 'uploads'),
    maxUploadBytes: integer(env, 'MAX_UPLOAD_BYTES', 5242880, 1024, 5242880),
  });
}
