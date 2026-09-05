// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * FR-AC-033 architecture invariant: the app handles no password material and no
 * password-reset tokens. It ASKS the provider to run a reset; the provider mails, hosts the
 * form, and enforces expiry, single use and replay.
 *
 * Completing a reset in-app would mean owning token generation, expiry, single-use
 * enforcement and replay protection — exactly the security work the provider exists to do —
 * and would thicken the one adapter FR-AC-019 keeps thin.
 *
 * There is ONE legitimate exception, and it is narrow: `register` takes a password from the
 * caller and passes it straight to the adapter without storing, logging, hashing or
 * inspecting it. That is why the exception is a named file rather than a pattern, and why the
 * test below also asserts the property that actually matters — the password is never written
 * anywhere and never reaches a log.
 *
 * Modelled on `no-deploy-imports.test.ts` and `idp-adapter-boundary.test.ts`: read from disk
 * so a bundler cannot tree-shake the evidence, and walk the tree so a NEW route is covered
 * without anyone remembering to list it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// tests/server/unit → packages/client
const clientRoot = path.resolve(here, '../../..');

/** The two files allowed to touch a password, and only in transit. */
const ALLOWED = new Set([
  'src/server/controllers/accounts.ts',
  'src/server/services/identity-provider.ts',
  'src/components/account/RegisterForm.tsx',
  'src/services/accounts.ts',
]);

// Patterns name the CAPABILITY — reading a password out of a payload, hashing one, or
// carrying a reset token — never the bare word.
//
// The first draft used /\bpassword\b/i and went red on four files, every one of them a
// COMMENT or a log message: "reset a password that is perfectly fine", the route's own
// directory name, `'[accounts] password reset could not be initiated'`. A guard that fires on
// prose gets muted, and then it is not a guard. Same conclusion `idp-adapter-boundary` reached
// about /keycloak/i and `no-deploy-imports` about the word "git" — three tests now, one lesson.
//
// Comments are stripped before matching (see `code()`), so an explanatory sentence can say
// "password" as often as it needs to.
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  // A field read out of a request body or declared in a schema.
  { label: 'password field', pattern: /(?:^|[^\w])(?:new|current|old)?[Pp]assword\s*[:?]/ },
  { label: 'password read', pattern: /\.(?:new|current)?password\b/i },
  { label: 'reset token', pattern: /reset[_-]?token|resetToken/i },
  { label: 'password hashing', pattern: /\b(?:bcrypt|argon2|scrypt|pbkdf2)\b/i },
];

/** Source with comments removed — the guard is about code, not prose. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
    .join('\n');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const routeFiles = walk(path.join(clientRoot, 'app/api'))
  .map((f) => path.relative(clientRoot, f))
  .filter((f) => !ALLOWED.has(f));

const serverFiles = walk(path.join(clientRoot, 'src/server'))
  .map((f) => path.relative(clientRoot, f))
  .filter((f) => !ALLOWED.has(f));

describe('FR-AC-033 — the app handles no password material', () => {
  it('finds the routes it is supposed to be guarding', () => {
    // Without this, a broken path silently turns the whole guard into a no-op that passes.
    expect(routeFiles.length).toBeGreaterThan(20);
    expect(serverFiles.length).toBeGreaterThan(20);
  });

  for (const rel of [...routeFiles, ...serverFiles]) {
    it(`${rel} neither accepts nor stores password material`, () => {
      const source = code(readFileSync(path.join(clientRoot, rel), 'utf8'));
      const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
        ({ label }) => label,
      );
      expect(hits, `${rel} must not handle passwords; found: ${hits.join(', ')}`).toEqual([]);
    });
  }

  it('never persists or logs the password it does pass through', async () => {
    // The exception list above says WHERE a password may appear; this says what may happen to
    // it there. A `console.log(body)` in the register controller would satisfy the file list
    // and still put a plaintext password in the logs.
    const controller = code(
      readFileSync(path.join(clientRoot, 'src/server/controllers/accounts.ts'), 'utf8'),
    );
    // Only lines that touch the password VALUE — `parsed.data.password` and the schema field.
    // The log line about a failed reset says the word and carries nothing.
    const passwordLines = controller
      .split('\n')
      .filter((line) => /(?:\.|\s)password\s*[:,)]|password\b\s*[:=]/i.test(line));
    expect(passwordLines.length).toBeGreaterThan(0);
    for (const line of passwordLines) {
      expect(line, `suspicious password handling: ${line.trim()}`).not.toMatch(
        /console\.|logger|\.save\(|\$set|JSON\.stringify/,
      );
    }
  });

  it('has no route that completes a reset — only one that initiates it', async () => {
    // The distinction FR-AC-033 turns on. A route accepting a token plus a new password is
    // the app owning the reset, whatever it delegates underneath.
    const resetRoutes = walk(path.join(clientRoot, 'app/api')).filter((f) =>
      /password|reset/i.test(path.relative(clientRoot, f)),
    );
    expect(resetRoutes).toHaveLength(1);
    const source = code(readFileSync(resetRoutes[0]!, 'utf8'));
    expect(source).not.toMatch(/newPassword|token/i);
  });
});
