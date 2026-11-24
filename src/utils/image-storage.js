import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { ApiError } from './api-error.js';
import { IMAGE_TYPES } from '../middlewares/upload.middleware.js';

export function createImageStorage(config) {
  return {
    async save(file) {
      if (!file) return null;
      const declared = IMAGE_TYPES[file.mimetype];
      try {
        const detected = await fileTypeFromBuffer(file.buffer);
        if (!detected || detected.mime !== file.mimetype || !declared) throw new Error('Tipo divergente');
        const image = sharp(file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
        const metadata = await image.metadata();
        if (metadata.format !== declared.format || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
          throw new Error('Formato de imagem inválido');
        }
        // stats() decodifica os pixels para rejeitar arquivos truncados, sem alterar o original.
        await image.stats();
      } catch {
        throw new ApiError(415, 'INVALID_FILE_TYPE', 'O conteúdo deve ser uma imagem JPEG, PNG ou WebP válida, não animada, com até 16 milhões de pixels.');
      }
      await mkdir(config.uploadDir, { recursive: true });
      const filename = `${randomUUID()}.${declared.extension}`;
      const destination = path.join(config.uploadDir, filename);
      try {
        await writeFile(destination, file.buffer, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        // Uma interrupção durante a escrita também pode deixar um arquivo parcial.
        if (error.code !== 'EEXIST') await unlink(destination).catch(() => {});
        throw error;
      }
      return `/uploads/${filename}`;
    },

    async remove(url) {
      if (!url) return;
      // Apenas arquivos gerados por esta aplicação podem ser removidos.
      if (!/^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/u.test(url)) return;
      try {
        await unlink(path.join(config.uploadDir, path.basename(url)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  };
}
