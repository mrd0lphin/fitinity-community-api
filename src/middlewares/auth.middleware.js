import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error.js';

export function authenticate(repository, config) {
  return async (req, res, next) => {
    const header = req.get('authorization');
    if (!header || !/^Bearer [^\s]+$/iu.test(header)) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Informe um token Bearer válido.');
    }
    let payload;
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret, {
        algorithms: ['HS256'], issuer: 'fitinity-api', audience: 'fitinity-community',
      });
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'Token inválido ou expirado.');
    }
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Token inválido ou expirado.');
    }
    const user = await repository.userById(userId);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário do token não encontrado.');
    req.user = user;
    next();
  };
}
