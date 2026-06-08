# Fridge Planner Constitution

## 1. Project Overview
*   **Goal:** Develop a robust, responsive meal planning application with calendar views.
*   **Core Philosophy:** Mobile-first, Type-safe, and User-centric.
*   **Primary Use Case:** Organize daily meals (Breakfast, Lunch, Dinner) across Day, Week, Month, and Year views.

## 2. Technology Stack

> **Per-branch realization.** This repository maintains two long-lived implementation branches against this one shared constitution (see `specs/BRANCHING_STRATEGY.md`). The items below marked *(per-branch)* are realized differently on each — the concrete frontend build/SSR toolchain is specified in each branch's `specs/<feature>/plan.md` "Stack Realization" section (currently: a Vite SPA on `impl/vite`, the Next.js 15 App Router on `impl/nextjs`). Everything else here is **shared** and binding on both implementations.

### Core
*   **Language:** TypeScript (Strict Mode).
*   **Frontend:** React 18 with a modern build/SSR toolchain *(per-branch — concrete framework in `plan.md`)*.
*   **Backend:** Node.js + Express.
*   **Database:** MongoDB with Mongoose ODM.
*   **Styling:** Tailwind CSS.
*   **State Management:** React Context + Hooks. Client state lives in context providers mounted at the application root; the concrete mounting point *(per-branch — e.g. an App Router `app/providers.tsx` vs an SPA root)* is specified in `plan.md`. Application state is not held in server-rendered components.

### Tooling
*   **Build:** Client build/bundler *(per-branch — e.g. `next build` standalone output vs Vite, specified in `plan.md`)*; tsx (server).
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
*   **Loading Speed:** First Contentful Paint (FCP) < 1.5s. *(The mechanism is per-branch — e.g. server rendering of route shells on `impl/nextjs` vs an optimized SPA bundle on `impl/vite`.)*
*   **Responsiveness:** Interaction to Next Paint (INP) < 200ms.
*   **Optimization:**
    *   Route-based code splitting (per-route bundles); concrete mechanism per-branch in `plan.md`.
    *   Lazy loading for images and heavy components.
    *   Keep client-JS boundaries as narrow as practical so above-the-fold content ships without unnecessary JS.
    *   Memoization (`useMemo`, `useCallback`) only where profiling shows necessity.

### V. Data Model Principles
*   **Meal Categories:** Always support Breakfast, Lunch, and Dinner.
*   **Ingredient Tracking:** Every meal can have ingredients with quantity and unit.
*   **Recipe Storage:** Meals can include full recipe instructions.
*   **Date Indexing:** Efficient queries for calendar date ranges.

## 4. Governance
*   **Git Workflow:** Two long-lived implementation branches (`impl/vite`, `impl/nextjs`) share one spec + this constitution on `main`. *Spec/contract* changes are authored on `main` (or short-lived `feat:`/`fix:`/`docs:` branches merged to `main`) and inherited by both impls on sync; *implementation* work happens on the relevant `impl/*` branch. Conventional Commits (`feat:`, `fix:`, `refactor:`). See `specs/BRANCHING_STRATEGY.md`.
*   **Code Review:** Focus on architectural fit, readability, and edge cases.
*   **Documentation:** Complex logic must be documented. `README.md` must be up to date.

**Version:** 3.1.0 | **Updated:** 2026-06-08
