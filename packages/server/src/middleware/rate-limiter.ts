import rateLimit from 'express-rate-limit';

export const defaultLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export const recommendationsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { type: 'https://fridge-planner.dev/errors/rate-limit-exceeded', title: 'Rate Limit Exceeded', status: 429, detail: 'Too many recommendation requests. Try again in a minute.' },
});
