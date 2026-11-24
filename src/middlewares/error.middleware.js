import multer from 'multer';
import { ApiError } from '../utils/api-error.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let failure = error;
  if (error instanceof multer.MulterError) {
    failure = error.code === 'LIMIT_FILE_SIZE'
      ? new ApiError(413, 'FILE_TOO_LARGE', 'O arquivo excede o tamanho máximo permitido.')
      : new ApiError(400, 'VALIDATION_ERROR', 'Upload inválido: confira o nome do campo, a quantidade e o tamanho dos campos.');
  } else if (error.type === 'entity.too.large') {
    failure = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'O corpo da requisição excede o limite permitido.');
  } else if (error.type === 'entity.parse.failed') {
    failure = new ApiError(400, 'VALIDATION_ERROR', 'O corpo JSON é inválido.');
  } else if (error.code === '23505') {
    failure = new ApiError(409, 'CONFLICT', 'Já existe um registro com esses dados.');
  } else if (error.code === '23503') {
    failure = new ApiError(404, 'NOT_FOUND', 'O recurso relacionado não foi encontrado.');
  } else if (error.code === '23514' || error.code === '22001' || error.code === '22P02') {
    failure = new ApiError(400, 'VALIDATION_ERROR', 'Os dados informados são inválidos.');
  } else if (error.status === 404 || error.code === 'ENOENT') {
    failure = new ApiError(404, 'NOT_FOUND', 'Recurso não encontrado.');
  } else if (!(error instanceof ApiError) && error.status >= 400 && error.status < 500) {
    failure = new ApiError(error.status, 'VALIDATION_ERROR', 'Requisição inválida.');
  }
  if (!(failure instanceof ApiError)) {
    // A resposta nunca inclui SQL, caminhos locais ou stack trace.
    console.error('Erro interno na API:', failure.message);
    failure = new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível concluir a operação.');
  }
  const payload = { code: failure.code, message: failure.message };
  if (failure.details) payload.details = failure.details;
  res.status(failure.status).json({ error: payload });
}
