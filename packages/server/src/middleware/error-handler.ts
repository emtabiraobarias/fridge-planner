import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { problemJson } from '../lib/errors.js';
import { AuthError } from '../lib/auth-errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AuthError) {
    problemJson(res, 401, 'Unauthorized', err.detail);
    return;
  }

  if (err instanceof ZodError) {
    problemJson(res, 400, 'Validation Error', err.errors.map((e) => e.message).join('; '));
    return;
  }

  if (err.name === 'ValidationError') {
    problemJson(res, 400, 'Validation Error', err.message as string);
    return;
  }

  problemJson(res, 500, 'Internal Server Error', 'An unexpected error occurred');
};
