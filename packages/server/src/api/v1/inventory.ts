import { Router } from 'express';

export const inventoryRouter = Router();

// GET /api/v1/inventory
inventoryRouter.get('/', (_req, res) => {
  res.json({ items: [] });
});

// POST /api/v1/inventory
inventoryRouter.post('/', (_req, res) => {
  res.status(201).json({ message: 'not implemented' });
});

// PUT /api/v1/inventory/:id
inventoryRouter.put('/:id', (_req, res) => {
  res.json({ message: 'not implemented' });
});

// DELETE /api/v1/inventory/:id
inventoryRouter.delete('/:id', (_req, res) => {
  res.status(204).send();
});
