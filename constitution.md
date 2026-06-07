# Fridge Planner Constitution

## 1. Project Overview
*   **Goal:** Develop a robust, responsive meal planning application with calendar views.
*   **Core Philosophy:** Mobile-first, Type-safe, and User-centric.
*   **Primary Use Case:** Organize daily meals (Breakfast, Lunch, Dinner) across Day, Week, Month, and Year views.

## 2. Technology Stack
### Core
*   **Language:** TypeScript (Strict Mode).
*   **Frontend:** React 18 with Next.js 15 (App Router).
*   **Backend:** Node.js + Express.
*   **Database:** MongoDB with Mongoose ODM.
*   **Styling:** Tailwind CSS.
*   **State Management:** React Context + Hooks. Client state lives in `'use client'` context providers mounted at the App Router root (`app/providers.tsx`); Server Components are not used for application state.

### Tooling
*   **Build:** Next.js (`next build`, standalone output for Docker) (client), tsx (server).
*   **Testing:** Vitest + React Testing Library, decoupled from the build via `vitest.config.ts` (client); Jest (server).
*   **Linting:** ESLint + TypeScript ESLint.

## 3. Core Principles

### I. Code Quality
*   **Strict Typing:** No implicit `any`. Interfaces/Types for all props and API responses.
*   **Component Purity:** Keep components small and focused (Single Responsibility Principle).
*   **Hooks:** Custom hooks for logic extraction; UI components should remain presentational where possible.
*   **Linting:** Zero warnings allowed in CI pipeline.

### II. Testing Standards
*   **Unit Testing:** Business logic and utility functions must have high coverage (>80%).
*   **Integration Testing:** Critical user flows must be tested via React Testing Library.
*   **Test-Driven:** Write tests for bugs before fixing them.
*   **Mocking:** Mock external API calls; do not rely on live backends for tests.

### III. User Experience & Consistency
*   **Responsive Design:**
    *   **Mobile-First:** Styles are written for mobile first, using `min-width` breakpoints (`md:`, `lg:`) for larger screens.
    *   **Fluid Layouts:** Use percentages, `flex`, and `grid` over fixed pixel widths.
*   **Accessibility (a11y):**
    *   Semantic HTML (`<main>`, `<nav>`, `<article>`).
    *   Keyboard navigability for all interactive elements.
    *   WCAG 2.1 AA compliance.
*   **Visual Consistency:** Use a centralized theme/design tokens via Tailwind config.

### IV. Performance Requirements
*   **Loading Speed:** First Contentful Paint (FCP) < 1.5s, met via Next.js server rendering of route shells.
*   **Responsiveness:** Interaction to Next Paint (INP) < 200ms.
*   **Optimization:**
    *   Route-based code splitting via the App Router (automatic per-route bundles).
    *   Lazy loading for images (`next/image`) and heavy components (`next/dynamic`).
    *   Keep `'use client'` boundaries as narrow as practical so server-rendered content ships without unnecessary client JS.
    *   Memoization (`useMemo`, `useCallback`) only where profiling shows necessity.

### V. Data Model Principles
*   **Meal Categories:** Always support Breakfast, Lunch, and Dinner.
*   **Ingredient Tracking:** Every meal can have ingredients with quantity and unit.
*   **Recipe Storage:** Meals can include full recipe instructions.
*   **Date Indexing:** Efficient queries for calendar date ranges.

## 4. Governance
*   **Git Workflow:** Feature branches off `main`. Conventional Commits (`feat:`, `fix:`, `refactor:`).
*   **Code Review:** Focus on architectural fit, readability, and edge cases.
*   **Documentation:** Complex logic must be documented. `README.md` must be up to date.

**Version:** 3.0.0 | **Updated:** 2026-05-31
