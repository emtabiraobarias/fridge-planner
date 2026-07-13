// Boots an in-memory MongoDB, then `next start` wired to it, for Playwright E2E.
// Dev auth seam (AUTH_MODE=dev + AUTH_ALLOW_DEV) → the browser authenticates as
// the "anonymous" user without an OIDC IdP. No Holodeck agent: recommendations
// fall back to popular recipes, feedback chat degrades to 502 (both by design).
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = process.env.E2E_PORT ?? '3100';

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri('fridge-planner-e2e');

const child = spawn('npx', ['next', 'start', '-p', PORT], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MONGODB_URI: uri,
    AUTH_MODE: 'dev',
    AUTH_ALLOW_DEV: 'true',
  },
});

async function shutdown(signal) {
  child.kill(signal);
  await mongo.stop();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
child.on('exit', (code) => {
  void mongo.stop().finally(() => process.exit(code ?? 0));
});
