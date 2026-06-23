// Stub for the `server-only` package under Vitest. The real package throws when
// imported outside Next.js's bundler (it has no plain-Node export), so node-env
// server tests alias it to this no-op.
export {};
