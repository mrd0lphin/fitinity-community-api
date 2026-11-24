export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Recurso não encontrado.') =>
  new ApiError(404, 'NOT_FOUND', message);

export const forbidden = () =>
  new ApiError(403, 'FORBIDDEN', 'Você só pode alterar ou excluir o próprio conteúdo.');
