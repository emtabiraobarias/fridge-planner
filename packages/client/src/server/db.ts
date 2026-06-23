import 'server-only';
import mongoose from 'mongoose';

const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/fridge-planner';

// Next.js dev hot-reload re-evaluates modules, which would otherwise open a new
// Mongoose connection (and recompile models) on every change. Cache the connection
// promise on globalThis so it survives reloads — one connection per process.
const globalForMongoose = globalThis as unknown as {
  _mongooseConn?: Promise<typeof mongoose>;
};

/**
 * Lazily connect to MongoDB, reusing a single cached connection across requests
 * and dev hot-reloads. Route handlers call this before touching any model.
 */
export async function connectDb(): Promise<typeof mongoose> {
  globalForMongoose._mongooseConn ??= mongoose.connect(MONGODB_URI);
  return globalForMongoose._mongooseConn;
}
