import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { inventoryRouter } from './api/v1/inventory.js';
import { recommendationsRouter } from './api/v1/recommendations.js';
import { errorHandler } from './middleware/error-handler.js';
import { defaultLimiter, recommendationsLimiter } from './middleware/rate-limiter.js';
import { authMiddleware } from './middleware/auth.js';

export const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173' }));
  app.use(express.json());
  app.use(pinoHttp({ logger }));
  app.use(defaultLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1', authMiddleware);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/recommendations', recommendationsLimiter, recommendationsRouter);

  app.use(errorHandler);

  return app;
}
