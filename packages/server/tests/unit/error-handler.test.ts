import { describe, it, expect, jest } from '@jest/globals';
import { ZodError, ZodIssueCode } from 'zod';
import { errorHandler } from '../../src/middleware/error-handler.js';

function createMockRes(): { status: jest.Mock; json: jest.Mock } {
  const res: Record<string, unknown> = {};
  res.json = jest.fn().mockReturnValue(res) as jest.Mock;
  res.status = jest.fn().mockReturnValue(res) as jest.Mock;
  return res as { status: jest.Mock; json: jest.Mock };
}

describe('errorHandler', () => {
  const req = {} as never;
  const next = jest.fn() as never;

  it('handles ZodError with 400 status', () => {
    const zodError = new ZodError([
      { code: ZodIssueCode.custom, message: 'Field is required', path: ['name'] },
    ]);
    const res = createMockRes();

    errorHandler(zodError, req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Validation Error', status: 400 }),
    );
  });

  it('handles Mongoose ValidationError with 400 status', () => {
    const mongooseError = new Error('Validation failed');
    mongooseError.name = 'ValidationError';
    const res = createMockRes();

    errorHandler(mongooseError, req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Validation Error', detail: 'Validation failed' }),
    );
  });

  it('handles generic errors with 500 status', () => {
    const genericError = new Error('Something broke');
    const res = createMockRes();

    errorHandler(genericError, req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Internal Server Error', status: 500 }),
    );
  });
});
