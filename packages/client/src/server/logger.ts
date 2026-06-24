import 'server-only';

type LogFields = Record<string, unknown>;

interface ServerLogger {
  info: (fields: LogFields, msg?: string) => void;
  warn: (fields: LogFields, msg?: string) => void;
  error: (fields: LogFields, msg?: string) => void;
}

// Minimal structured logger for the Next.js server layer, mirroring the pino call
// signature (`logger.error({ err }, 'message')`) used by libs migrated from Express,
// so those libs need no rewrite beyond the import path. console.warn/error are
// permitted by the lint rules; console.log is not.
export const logger: ServerLogger = {
  info: (fields, msg) => {
    console.warn('[info]', msg ?? '', fields);
  },
  warn: (fields, msg) => {
    console.warn('[warn]', msg ?? '', fields);
  },
  error: (fields, msg) => {
    console.error('[error]', msg ?? '', fields);
  },
};
