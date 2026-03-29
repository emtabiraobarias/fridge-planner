# Fridge Planner - Agent & Developer Guide

Monorepo with React client and Node/Express server.

> **AGENTS**: Use **TypeScript** (`.ts/.tsx`) for all new code. Follow strict typing principles.

---

## 1. Commands

### Root
| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server concurrently |
| `npm run client` | Vite client only (port 5173) |
| `npm run server` | Express server only (port 3001) |

### Client (`packages/client`)
| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |

### Server (`packages/server`)
| Command | Description |
|---------|-------------|
| `npm start` | Start server |
| `npm test` | Run all Jest tests |
| `npm test -- src/models/meal.test.ts` | Single test file |
| `npm test -- --testPathPattern=fridge` | Tests matching pattern |

---

## 2. Project Structure

```
packages/
├── client/src/
│   ├── components/<Feature>/  # Colocated components
│   ├── context/               # React Context providers
│   ├── hooks/                 # Custom hooks
│   ├── pages/                 # Route components
│   ├── types/                 # Shared TypeScript types
│   └── services/api.ts        # API client
└── server/src/
    ├── models/                # Mongoose schemas + tests
    ├── routes/                # Express handlers
    ├── types/                 # Shared TypeScript types
    ├── db.ts                  # MongoDB connection
    └── index.ts               # Entry point
```

---

## 3. Code Style

### General
- **Indentation**: 2 spaces
- **Semicolons**: Required
- **Quotes**: Single quotes
- **Trailing commas**: In multiline objects/arrays
- **File naming**: `kebab-case.ts` utilities, `PascalCase.tsx` components

### TypeScript Rules
- **Strict mode**: Enabled (`"strict": true` in tsconfig)
- **No implicit any**: All variables, parameters, and returns must be typed
- **Interfaces over types**: Prefer `interface` for object shapes; use `type` for unions/intersections
- **Explicit return types**: Required for exported functions

### Client (React + TypeScript)
```tsx
import { useState } from 'react';
import MealCard from './MealCard';

interface Meal {
  _id: string;
  name: string;
  date: Date;
  type: 'breakfast' | 'lunch' | 'dinner';
}

interface MealListProps {
  meals: Meal[];
  onSelect: (meal: Meal) => void;
}

const MealList = ({ meals, onSelect }: MealListProps): JSX.Element => {
  const [filter, setFilter] = useState<string>('all');
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {meals.map((meal) => (
        <MealCard key={meal._id} meal={meal} onClick={() => onSelect(meal)} />
      ))}
    </div>
  );
};

export default MealList;
```
- Functional components with hooks only
- Define `Props` interface for each component
- Use `apiClient` from `services/api.ts` (no raw fetch)
- Tailwind CSS; mobile-first (`md:`/`lg:` for larger screens)

### Server (Node + TypeScript)
```typescript
import express, { Request, Response, Router } from 'express';
import Meal from '../models/meal';

const router: Router = express.Router();

interface MealsQuery {
  start?: string;
  end?: string;
}

router.get('/', async (req: Request<{}, {}, {}, MealsQuery>, res: Response): Promise<void> => {
  try {
    const { start } = req.query;
    const meals = await Meal.find({ date: { $gte: new Date(start ?? '') } });
    res.json(meals);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /meals error:', message);
    res.status(500).json({ error: 'Server Error' });
  }
});

export default router;
```
- Use ES Modules (`import`/`export`)
- Always `async/await` for DB operations
- Wrap handlers in `try/catch` with typed error handling
- JSON for all responses; correct HTTP status codes

---

## 4. Testing

### Server (Jest + ts-jest)
- Colocate tests: `meal.ts` → `meal.test.ts`
- `NODE_ENV=test` uses `fridge-planner-test` database

```typescript
import Meal from './meal';

describe('Meal Model', () => {
  it('should require a name', async () => {
    const meal = new Meal({ date: new Date(), type: 'lunch' });
    await expect(meal.validate()).rejects.toThrow(/name/);
  });
});
```

### Client (Vitest + RTL)
- Test user interactions, not implementation
- Mock API calls; focus on critical flows

---

## 5. Constitution Compliance

| Principle | Rule |
|-----------|------|
| Strict Typing | No implicit `any`; interfaces for all props/responses |
| Mobile-First | Base styles for mobile; `md:`/`lg:` breakpoints |
| Component Purity | Small, focused (SRP) |
| Zero Lint Warnings | Run `npm run lint` before commit |
| Accessibility | Semantic HTML, keyboard nav, ARIA |
| Performance | Code-split routes, lazy images |

---

## 6. Git Workflow

- **Branches**: Feature branches off `main` (`feat/calendar-month-view`)
- **Commits**: Conventional format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- **PR**: Tests pass, no lint warnings

---

## 7. Specifications

| File | Purpose |
|------|---------|
| `.specify/memory/constitution.md` | Core principles |
| `.specify/memory/plan.md` | Architecture decisions |
| `.specify/memory/spec.md` | Feature requirements |
| `.specify/memory/tasks.md` | Implementation checklist |

No `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` found.
