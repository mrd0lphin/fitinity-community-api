import path from 'node:path';
import multer from 'multer';
import { ApiError } from '../utils/api-error.js';

export const IMAGE_TYPES = {
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], extension: 'jpg', format: 'jpeg' },
  'image/png': { extensions: ['.png'], extension: 'png', format: 'png' },
  'image/webp': { extensions: ['.webp'], extension: 'webp', format: 'webp' },
};

export function createUpload(config) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5, fieldSize: 24000, parts: 6 },
    fileFilter(req, file, callback) {
      const type = IMAGE_TYPES[file.mimetype];
      const extension = path.extname(file.originalname).toLowerCase();
      if (!type || !type.extensions.includes(extension)) {
        return callback(new ApiError(415, 'INVALID_FILE_TYPE', 'Envie uma imagem JPEG, PNG ou WebP com extensão e MIME correspondentes.'));
      }
      callback(null, true);
    },
  });
  return {
    single(field) {
      const parse = upload.single(field);
      return (req, res, next) => parse(req, res, (error) => {
        if (error && !(error instanceof ApiError) && !(error instanceof multer.MulterError)) {
          return next(new ApiError(400, 'VALIDATION_ERROR', 'O formulário multipart está incompleto ou inválido.'));
        }
        next(error);
      });
    },
  };
}
