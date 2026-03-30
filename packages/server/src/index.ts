import mongoose from 'mongoose';
import { createApp, logger } from './app.js';

const port = parseInt(process.env['PORT'] ?? '3001', 10);
const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/fridge-planner';

async function start(): Promise<void> {
  await mongoose.connect(mongoUri);
  logger.info({ mongoUri }, 'Connected to MongoDB');

  const app = createApp();
  app.listen(port, () => {
    logger.info({ port }, 'Server started');
  });
}

start().catch((err: unknown) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
