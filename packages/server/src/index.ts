import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { createApp, logger } from './app.js';

const port = parseInt(process.env['PORT'] ?? '3001', 10);
const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/fridge-planner';

let server: Server;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

async function start(): Promise<void> {
  await mongoose.connect(mongoUri);
  logger.info({ mongoUri }, 'Connected to MongoDB');

  const app = createApp();
  server = app.listen(port, () => {
    logger.info({ port }, 'Server started');
  });

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

start().catch((err: unknown) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
