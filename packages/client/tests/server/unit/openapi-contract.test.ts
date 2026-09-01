// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

/**
 * CR-013 (spec 001): "APIs MUST be documented with OpenAPI 3.0 specification."
 *
 * The document is GENERATED (`scripts/generate-openapi.mjs`); this is the guard that makes it
 * stay true. Without it, `docs/openapi.yaml` becomes fiction the first time someone adds a
 * route — which is not hypothetical here: a roadmap entry, a set of reminders and CLAUDE.md's
 * own endpoint table all drifted out of date within one week.
 *
 * Checked BOTH directions deliberately. A one-way check passes while the document quietly
 * describes routes that no longer exist, which is how the smoke gate ended up probing a
 * removed endpoint.
 */
const API_ROOT = join(__dirname, '../../../app/api');
const DOC = join(__dirname, '../../../../../docs/openapi.yaml');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name === 'route.ts') acc.push(p);
  }
  return acc;
}

function toPath(file: string): string {
  const rel = relative(API_ROOT, file).replace(/\/route\.ts$/, '');
  return (
    '/api/' +
    rel
      .split('/')
      .map((s) => (s.startsWith('[') ? `{${s.slice(1, -1)}}` : s))
      .join('/')
  );
}

/** Every `METHOD path` the route tree actually exposes. */
function operationsOnDisk(): string[] {
  const out: string[] = [];
  for (const file of walk(API_ROOT)) {
    const src = readFileSync(file, 'utf8');
    for (const m of METHODS) {
      // Both export styles — /api/health is synchronous.
      if (new RegExp(`export (?:async )?function ${m}\\b`).test(src)) out.push(`${m} ${toPath(file)}`);
    }
  }
  return out.sort();
}

function operationsInDoc(): string[] {
  const doc = parse(readFileSync(DOC, 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return Object.entries(doc.paths)
    .flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`))
    .sort();
}

describe('CR-013 — the OpenAPI document matches the routes', () => {
  it('documents every route the app exposes', () => {
    const missing = operationsOnDisk().filter((o) => !operationsInDoc().includes(o));
    expect(missing, 'undocumented routes — run npm -w packages/client run openapi:generate').toEqual([]);
  });

  it('describes no route that does not exist', () => {
    // The direction that catches a RETIRED endpoint still being advertised.
    const phantom = operationsInDoc().filter((o) => !operationsOnDisk().includes(o));
    expect(phantom, 'documented routes with no handler — regenerate').toEqual([]);
  });

  it('is OpenAPI 3.0 with the shared RFC 7807 error shape', () => {
    const doc = parse(readFileSync(DOC, 'utf8')) as Record<string, any>;
    expect(doc.openapi).toMatch(/^3\.0/);
    // Every error in the app comes from `problem()` in src/server/http.ts.
    expect(doc.components.schemas.Problem.required).toEqual(['type', 'title', 'status', 'detail']);
  });

  it('marks the health endpoints as the only unauthenticated ones', () => {
    const doc = parse(readFileSync(DOC, 'utf8')) as {
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    };
    const open = Object.entries(doc.paths)
      .filter(([, ops]) => Object.values(ops).some((o) => Array.isArray(o.security) && o.security.length === 0))
      .map(([p]) => p)
      .sort();
    // `/api/health` must never change shape — the Docker healthcheck, verify-rollout.sh and the
    // smoke gate all depend on it exactly (CLAUDE.md §4).
    expect(open).toEqual(['/api/health', '/api/health/ready']);
  });

  it('requires a bearer token everywhere else', () => {
    const doc = parse(readFileSync(DOC, 'utf8')) as Record<string, any>;
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('gives every administrator route a 403 — never a 401 (FR-FL-055)', () => {
    const doc = parse(readFileSync(DOC, 'utf8')) as {
      paths: Record<string, Record<string, { tags?: string[]; responses: Record<string, unknown> }>>;
    };
    const adminOps = Object.entries(doc.paths).flatMap(([p, ops]) =>
      Object.entries(ops)
        .filter(([, o]) => o.tags?.includes('admin'))
        .map(([m, o]) => [`${m.toUpperCase()} ${p}`, o] as const),
    );
    expect(adminOps.length).toBeGreaterThan(0);
    // 401 is the client's refresh-and-retry trigger, so an admin route answering 401 loops.
    const without403 = adminOps.filter(([, o]) => !('403' in o.responses)).map(([n]) => n);
    expect(without403).toEqual([]);
  });
});
