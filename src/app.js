import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { createController } from './controllers/community.controller.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { createRepository } from './repositories/community.repository.js';
import { createRoutes } from './routes/community.routes.js';
import { createService } from './services/community.service.js';
import { ApiError } from './utils/api-error.js';
import { createImageStorage } from './utils/image-storage.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  // Swagger usa scripts inline; a API retorna JSON e nunca interpreta HTML enviado pelo usuário.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '64kb', strict: true }));

  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ data: { status: 'ok', database: 'connected' } });
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Banco de dados indisponível.');
    }
  });

  app.get('/openapi.json', (req, res) => res.sendFile(path.join(projectRoot, 'docs/openapi.json')));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(null, {
    customSiteTitle: 'Fitinity Community API', swaggerOptions: { url: '/openapi.json', persistAuthorization: false },
  }));
  app.use('/uploads', express.static(config.uploadDir, {
    dotfiles: 'deny', index: false, fallthrough: false,
    setHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); },
  }));

  const repository = createRepository(db);
  const service = createService(repository, createImageStorage(config), config);
  app.use('/api', createRoutes(createController(service), repository, config));
  app.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Rota não encontrada.')));
  app.use(errorHandler);

  return app;
}
