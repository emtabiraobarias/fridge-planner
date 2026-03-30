import type { Response } from 'express';

/** RFC 7807 Problem Details */
export function problemJson(
  res: Response,
  status: number,
  title: string,
  detail: string,
): void {
  res.status(status).json({
    type: `https://fridge-planner.dev/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
  });
}
