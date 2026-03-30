import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { inventoryRouter } from './api/v1/inventory.js';
import { recommendationsRouter } from './api/v1/recommendations.js';

export const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/recommendations', recommendationsRouter);

  return app;
}
