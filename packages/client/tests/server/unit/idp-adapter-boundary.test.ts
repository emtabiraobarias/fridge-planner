// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * FR-AC-019/020 architecture invariant: the identity provider is reachable through EXACTLY
 * one module. `services/identity-provider.ts` speaks Keycloak; nothing else may.
 *
 * The point is not tidiness. Spec 013 exists because the provider's `sub` had leaked into
 * every user-keyed document, which made changing providers a data migration rather than a
 * configuration change. An admin-API call sprayed across controllers would rebuild that same
 * coupling in a new place — and the next provider change would find it the same way this one
 * did: too late.
 *
 * Modelled on `no-deploy-imports.test.ts`, and reading from disk rather than importing for
 * the same reasons: it catches a string reference a bundler might tree-shake, and it keeps
 * holding as files are added — this one walks the whole server tree rather than a fixed list,
 * so a NEW file that calls the admin API is caught without anyone remembering to list it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// tests/server/unit → packages/client
const clientRoot = path.resolve(here, '../../..');

/** The one module allowed to know what provider we run. */
const ADAPTER = 'src/server/services/identity-provider.ts';

const SEARCH_ROOTS = ['src/server', 'src/services', 'src/components', 'src/views', 'app'];

// Provider-specific vocabulary. These name the CAPABILITY — an admin-API call or a
// provider-admin credential — never the bare product name.
//
// `/keycloak/i` was tried and removed within the minute: it fired on three explanatory
// comments ("Keycloak rotates refresh tokens", "default Keycloak's realm_access.roles") and
// on nothing else. A guard that goes red when someone improves a comment gets deleted or
// muted, and then it is not a guard. `no-deploy-imports.test.ts` reached the same conclusion
// about the bare word "git".
//
// Note what is deliberately NOT forbidden: the OIDC protocol endpoints. `services/http.ts`
// talks to the provider's token endpoint for the refresh grant (spec 002 FR-D-010), and that
// is the standard protocol every OIDC provider implements — not the administrative API this
// requirement is about. FR-AC-019/020 confine ADMINISTRATIVE reach, which is the new posture
// spec 013 introduces; the protocol seam was already provider-agnostic.
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'admin credentials', pattern: /IDP_ADMIN_CLIENT_(?:ID|SECRET)/ },
  { label: 'keycloak admin REST path', pattern: /admin\/realms/ },
  { label: 'auth0 management API', pattern: /auth0\.com\/api|@auth0\//i },
  { label: 'okta SDK', pattern: /@okta\/|okta\.com\/api/i },
  { label: 'entra/graph users API', pattern: /graph\.microsoft\.com/i },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = SEARCH_ROOTS.flatMap((root) => {
  const full = path.join(clientRoot, root);
  try {
    return walk(full);
  } catch {
    return []; // a root that does not exist yet is not a violation
  }
}).map((f) => path.relative(clientRoot, f));

describe('FR-AC-019/020 — the identity provider is reachable through one module only', () => {
  it('finds the source tree it is supposed to be guarding', () => {
    // Without this, a broken path silently turns the whole guard into a no-op that passes.
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it('has an adapter to be the single seam', () => {
    expect(sourceFiles).toContain(ADAPTER);
  });

  for (const rel of sourceFiles.filter((f) => f !== ADAPTER)) {
    it(`${rel} does not reach the provider directly`, () => {
      const source = readFileSync(path.join(clientRoot, rel), 'utf8');
      const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
        ({ label }) => label,
      );
      expect(hits, `${rel} must go through ${ADAPTER}; found: ${hits.join(', ')}`).toEqual([]);
    });
  }

  it('is not reachable from any read path — a provider outage cannot break reads', () => {
    // The other half of FR-AC-019's value, and the one that matters at 3am. Every read in the
    // app passes through `authenticate()`; if that could call the provider's admin API, an
    // outage at the provider would take the whole app down rather than just the account
    // surface. Token verification is a JWKS fetch with a cached key set, which is a different
    // thing entirely.
    const readPaths = [
      'src/server/auth.ts',
      'src/server/db.ts',
      'src/server/route-helpers.ts',
      'src/server/lib/account-purge.ts',
    ];
    for (const rel of readPaths) {
      const source = readFileSync(path.join(clientRoot, rel), 'utf8');
      expect(source, `${rel} must not depend on the identity provider`).not.toMatch(
        /identity-provider/,
      );
    }
  });
});

