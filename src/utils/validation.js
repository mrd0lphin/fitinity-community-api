import { ApiError } from './api-error.js';

export function invalid(message, field) {
  throw new ApiError(400, 'VALIDATION_ERROR', message, field ? { field } : undefined);
}

export function bodyFields(body, allowed) {
  const input = body ?? {};
  if (typeof input !== 'object' || Array.isArray(input) || input === null) {
    invalid('O corpo da requisição deve ser um objeto.');
  }
  const unknown = Object.keys(input).filter((field) => !allowed.includes(field));
  if (unknown.length) invalid(`Campo não permitido: ${unknown[0]}.`, unknown[0]);
  return input;
}

export function text(value, field, { min = 1, max } = {}) {
  if (typeof value !== 'string') invalid(`${field} deve ser um texto.`, field);
  if (value.includes('\u0000')) invalid(`${field} contém um caractere inválido.`, field);
  const result = value.trim();
  if (result.length < min || (max && result.length > max)) {
    invalid(`${field} deve conter entre ${min} e ${max ?? 'muitos'} caracteres.`, field);
  }
  return result;
}

export function email(value) {
  const normalized = text(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    invalid('Informe um e-mail válido.', 'email');
  }
  return normalized;
}

export function password(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) {
    invalid('A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes UTF-8.', 'password');
  }
  return value;
}

export function id(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
    invalid('O identificador deve ser um número inteiro positivo.', 'id');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2147483647) {
    invalid('O identificador está fora do intervalo permitido.', 'id');
  }
  return parsed;
}

export function pagination(query) {
  const unknown = Object.keys(query).filter((key) => !['page', 'limit'].includes(key));
  if (unknown.length) invalid(`Parâmetro não permitido: ${unknown[0]}.`, unknown[0]);
  const read = (value, fallback, field, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
      invalid(`${field} deve ser um número inteiro positivo.`, field);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > max) {
      invalid(`${field} deve ser no máximo ${max}.`, field);
    }
    return parsed;
  };
  const page = read(query.page, 1, 'page', 1000000);
  const limit = read(query.limit, 20, 'limit', 100);
  return { page, limit, offset: (page - 1) * limit };
}

export function boolean(value, field) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  invalid(`${field} deve ser true ou false.`, field);
}
