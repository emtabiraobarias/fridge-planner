#!/usr/bin/env node
/**
 * Generate the OpenAPI 3.0 document from the ROUTES THEMSELVES (CR-013, spec 001).
 *
 * Hand-written API docs rot. This repo has watched it happen to a roadmap entry, a set of
 * reminders and CLAUDE.md's own endpoint table in a single week, so the parts that CAN be
 * derived are derived, and `openapi-contract.test.ts` fails the build if the committed
 * document and the route tree disagree.
 *
 * Derived from the filesystem and a grep of each handler — these cannot drift:
 *   • path + path parameters (directory structure, `[id]` → `{id}`)
 *   • which HTTP methods exist (the exported handler names)
 *   • whether the route is administrator-guarded (`requirePrincipalAdmin`)
 *   • whether it is rate-limited (`rateLimit(`)
 *   • the RFC 7807 error shape every route shares via `problem()`
 *
 * NOT derived: request/response body schemas. Validation lives in the controllers, not in a
 * per-route schema registry, so there is nothing honest to read. They are enriched from
 * `openapi-descriptions.json` and default to a permissive object — a documented gap, not a
 * silent one. Deriving those properly means exporting a Zod schema per route; the drift test
 * makes that a safe incremental change rather than a big-bang refactor.
 *
 * Usage: node scripts/generate-openapi.mjs [--check]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_ROOT = 'app/api';
const OUT = '../../docs/openapi.yaml';
const DESCRIPTIONS = 'scripts/openapi-descriptions.json';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name === 'route.ts') acc.push(p);
  }
  return acc;
}

/** `app/api/v1/inventory/[id]/route.ts` → `/api/v1/inventory/{id}` */
function toPath(file) {
  const rel = relative(API_ROOT, file).replace(/\/route\.ts$/, '');
  return '/api/' + rel.split('/').map((s) => (s.startsWith('[') ? `{${s.slice(1, -1)}}` : s)).join('/');
}

function paramsOf(path) {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

const descriptions = existsSync(DESCRIPTIONS) ? JSON.parse(readFileSync(DESCRIPTIONS, 'utf8')) : {};
const paths = {};

for (const file of walk(API_ROOT).sort()) {
  const src = readFileSync(file, 'utf8');
  const path = toPath(file);
  const isAdmin = src.includes('requirePrincipalAdmin');
  const isLimited = src.includes('rateLimit(');
  const isPublic = /health/.test(path);

  for (const m of METHODS) {
    // `export async function` AND `export function` — /api/health is synchronous, and matching
    // only the async form silently dropped it. A generator that misses routes is worse than no
    // generator: the drift test would then be checking an incomplete document against itself.
    if (!new RegExp(`export (?:async )?function ${m}\\b`).test(src)) continue;
    const key = `${m} ${path}`;
    const responses = { '200': { $ref: '#/components/responses/Ok' } };
    if (!isPublic) {
      responses['401'] = { $ref: '#/components/responses/Problem' };
      if (isAdmin) responses['403'] = { $ref: '#/components/responses/Problem' };
    }
    if (isLimited) responses['429'] = { $ref: '#/components/responses/Problem' };
    responses['500'] = { $ref: '#/components/responses/Problem' };

    (paths[path] ??= {})[m.toLowerCase()] = {
      summary: descriptions[key] ?? `${m} ${path}`,
      ...(isAdmin ? { tags: ['admin'] } : {}),
      ...(paramsOf(path).length ? { parameters: paramsOf(path) } : {}),
      ...(isPublic ? { security: [] } : {}),
      ...(['POST', 'PUT', 'PATCH'].includes(m)
        ? { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } }
        : {}),
      responses,
    };
  }
}

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'Fridge Planner API',
    version: '1.0.0',
    description:
      'Generated from the route tree by scripts/generate-openapi.mjs (CR-013). Paths, methods, ' +
      'authorization and error responses are derived and cannot drift; request/response body ' +
      'schemas are not yet modelled — see the script header.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'local dev' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      // RFC 7807. Every error in the app is produced by `problem()` in src/server/http.ts.
      Problem: {
        type: 'object',
        required: ['type', 'title', 'status', 'detail'],
        properties: {
          type: { type: 'string', format: 'uri' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
          instance: { type: 'string' },
        },
      },
    },
    responses: {
      Ok: { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } },
      Problem: {
        description: 'RFC 7807 problem document',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
    },
  },
  paths,
};

function toYaml(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return ' []';
    return '\n' + v.map((i) => `${pad}- ${toYaml(i, indent + 1).replace(/^\n?/, '').trimStart()}`).join('\n');
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return ' {}';
    return '\n' + keys.map((k) => `${pad}${JSON.stringify(k)}:${toYaml(v[k], indent + 1)}`).join('\n');
  }
  return ' ' + JSON.stringify(v);
}

const yaml = '# GENERATED by scripts/generate-openapi.mjs — do not edit by hand.\n' +
  '# Regenerate with: npm -w packages/client run openapi:generate\n' +
  Object.keys(doc).map((k) => `${JSON.stringify(k)}:${toYaml(doc[k], 1)}`).join('\n') + '\n';

const routeCount = Object.values(paths).reduce((n, ops) => n + Object.keys(ops).length, 0);

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== yaml) {
    console.error('❌ docs/openapi.yaml is stale — run: npm -w packages/client run openapi:generate');
    process.exit(1);
  }
  console.log(`✓ openapi.yaml current (${Object.keys(paths).length} paths, ${routeCount} operations)`);
} else {
  writeFileSync(OUT, yaml);
  console.log(`✓ wrote docs/openapi.yaml — ${Object.keys(paths).length} paths, ${routeCount} operations`);
}
