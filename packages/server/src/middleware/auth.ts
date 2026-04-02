import type { Request, Response, NextFunction } from 'express';

// TODO: CR-001 -- Replace with proper OAuth 2.0/OIDC validation
// Current implementation uses a development stub that extracts userId from
// the X-User-Id header, defaulting to 'anonymous'. In production, this
// should validate Bearer JWT tokens against an OIDC provider.

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.userId = (req.headers['x-user-id'] as string) ?? 'anonymous';
  next();
}
