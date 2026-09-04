import 'server-only';

/**
 * THE identity-provider adapter (spec 013, research R4).
 *
 * Every operation the app performs against the identity provider goes through this module and
 * nowhere else (FR-AC-019/020), enforced by `tests/server/unit/idp-adapter-boundary.test.ts`.
 *
 * The reason is the reason spec 013 exists at all. The provider's `sub` leaked into every
 * user-keyed document, and changing providers became a data migration instead of a
 * configuration change. Admin-API calls sprayed across controllers would rebuild that coupling
 * somewhere new, and the next provider change would find it the same way this one did: too
 * late. Confined here, a provider change replaces one file.
 *
 * The six operations are named in the APP's vocabulary, not Keycloak's (FR-AC-042). Each is a
 * standard provider-admin concept spelled differently by each vendor — Keycloak
 * `enabled:false`, Auth0 `blocked:true`, Okta `lifecycle/suspend`, Entra
 * `accountEnabled:false` are one intent written four ways. `suspend` is the intent.
 *
 * ⚠️ This is the app's first ADMINISTRATIVE reach into the provider — a deliberate change of
 * posture that spec 002 avoided, recorded as such in plan.md's Complexity Tracking. It is
 * scoped to `manage-users` (FR-AC-032) and its credentials are runtime-only (FR-AC-030/031).
 */

/** A provider operation that failed for a reason worth showing the person who caused it. */
export class IdentityProviderError extends Error {
  /**
   * True when the provider rejected the INPUT (a weak password, a malformed address) rather
   * than failing. FR-AC-017 requires the provider's stated reason to reach the user, and a
   * generic 500 would leave someone retyping a password with no idea what is wrong with it.
   */
  readonly userFacing: boolean;
  readonly status: number | undefined;

  constructor(message: string, opts: { userFacing?: boolean; status?: number } = {}) {
    super(message);
    this.name = 'IdentityProviderError';
    this.userFacing = opts.userFacing ?? false;
    this.status = opts.status;
  }
}

export interface NewUser {
  email: string;
  password: string;
  displayName: string;
}

export interface IdentityProvider {
  /** Create the account at the provider. Returns the provider's subject for it. */
  createUser(user: NewUser): Promise<string>;
  /** Ask the provider to send its own verification mail (FR-AC-013). */
  sendVerification(subject: string): Promise<void>;
  /** Ask the provider to run its own password-reset flow (FR-AC-022/033). */
  initiatePasswordReset(subject: string): Promise<void>;
  /** Make the account unusable without destroying it — the erasure window (FR-AC-039). */
  suspend(subject: string): Promise<void>;
  /** Undo `suspend` when an erasure is reversed inside the window (FR-AC-040). */
  resume(subject: string): Promise<void>;
  /** Destroy the account at the provider, at purge (FR-AC-041). */
  deleteUser(subject: string): Promise<void>;
}

// ——— Keycloak ———
//
// Everything below this line is the only Keycloak-specific code in the app.

/**
 * Credentials come from the environment on every call, never captured at module scope
 * (FR-AC-030/031). Read at call time so a test can set them, and so a process that is only
 * serving reads never needs them at all.
 */
function adminCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env['IDP_ADMIN_CLIENT_ID'];
  const clientSecret = process.env['IDP_ADMIN_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new IdentityProviderError(
      'Account management is not configured on this deployment',
      { userFacing: true },
    );
  }
  return { clientId, clientSecret };
}

/**
 * The provider's base URL and realm, derived from `AUTH_JWKS_URI`.
 *
 * Deliberately NOT a new environment variable. `AUTH_JWKS_URI` already points at the realm we
 * verify tokens against, and in production it is the INTERNAL address
 * (`http://keycloak:8080/...`) while `AUTH_ISSUER` is the public one — which is precisely the
 * address an admin call should use. A separate variable could disagree with the one we
 * actually authenticate against, and the failure would be silent: tokens verified against one
 * realm, users created in another.
 */
function realmEndpoint(): { base: string; realm: string } {
  const jwksUri = process.env['AUTH_JWKS_URI'];
  if (!jwksUri) {
    throw new IdentityProviderError('Account management is not configured on this deployment', {
      userFacing: true,
    });
  }
  const match = /^(.*)\/realms\/([^/]+)\//.exec(jwksUri);
  if (!match?.[1] || !match[2]) {
    throw new IdentityProviderError(`Cannot derive the provider realm from AUTH_JWKS_URI`);
  }
  return { base: match[1], realm: match[2] };
}

async function accessToken(): Promise<string> {
  const { clientId, clientSecret } = adminCredentials();
  const { base, realm } = realmEndpoint();
  const res = await fetch(`${base}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new IdentityProviderError(
      `Identity provider refused the service account (${res.status})`,
      { status: res.status },
    );
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new IdentityProviderError('Identity provider returned no token');
  return body.access_token;
}

/**
 * Pull a usable sentence out of a provider error body.
 *
 * FR-AC-017: when the provider rejects a password, the person retyping it needs to know why.
 * Keycloak answers with `errorMessage` or `error_description` depending on the endpoint.
 */
function reasonFrom(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    for (const key of ['errorMessage', 'error_description', 'error']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim() !== '') return value;
    }
  }
  return fallback;
}

async function adminFetch(
  pathname: string,
  init: { method: string; body?: unknown },
): Promise<Response> {
  const token = await accessToken();
  const { base, realm } = realmEndpoint();
  const res = await fetch(`${base}/admin/realms/${realm}${pathname}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!res.ok) {
    // 4xx is the provider judging the INPUT; 5xx is the provider failing. Only the former
    // says anything a user can act on, and a 409 is the caller's to interpret (FR-AC-016
    // must not disclose whether an address is registered), so it is passed through with its
    // status rather than described.
    const body = await res.json().catch(() => null);
    throw new IdentityProviderError(
      reasonFrom(body, `Identity provider rejected the request (${res.status})`),
      { userFacing: res.status < 500, status: res.status },
    );
  }
  return res;
}

/** The subject Keycloak assigns, which arrives only in the `Location` header of a create. */
function subjectFromLocation(res: Response): string {
  const location = res.headers.get('location');
  const id = location?.split('/').pop();
  if (!id) throw new IdentityProviderError('Identity provider returned no user id');
  return id;
}

export const keycloak: IdentityProvider = {
  async createUser({ email, password, displayName }: NewUser): Promise<string> {
    const res = await adminFetch('/users', {
      method: 'POST',
      body: {
        username: email,
        email,
        firstName: displayName,
        // `false`, and the session refusal in `authenticate()` is what enforces it
        // (FR-AC-014). Relying on the provider flag alone would leave the app trusting a
        // setting it does not own.
        emailVerified: false,
        enabled: true,
        credentials: [{ type: 'password', value: password, temporary: false }],
      },
    });
    return subjectFromLocation(res);
  },

  async sendVerification(subject: string): Promise<void> {
    // The provider owns the mail, the template and the token. The app never sees any of it
    // (FR-AC-033) — it only asks.
    await adminFetch(`/users/${encodeURIComponent(subject)}/execute-actions-email`, {
      method: 'PUT',
      body: ['VERIFY_EMAIL'],
    });
  },

  async initiatePasswordReset(subject: string): Promise<void> {
    await adminFetch(`/users/${encodeURIComponent(subject)}/execute-actions-email`, {
      method: 'PUT',
      body: ['UPDATE_PASSWORD'],
    });
  },

  async suspend(subject: string): Promise<void> {
    // Not a delete. The erasure window is reversible (FR-AC-040), so the account has to
    // survive it — disabled, and holding nothing the user can sign into.
    await adminFetch(`/users/${encodeURIComponent(subject)}`, {
      method: 'PUT',
      body: { enabled: false },
    });
  },

  async resume(subject: string): Promise<void> {
    await adminFetch(`/users/${encodeURIComponent(subject)}`, {
      method: 'PUT',
      body: { enabled: true },
    });
  },

  async deleteUser(subject: string): Promise<void> {
    await adminFetch(`/users/${encodeURIComponent(subject)}`, { method: 'DELETE' });
  },
};

/**
 * The provider the app uses. A single indirection so callers name an intent rather than a
 * vendor, and so swapping providers is one assignment plus one implementation.
 */
export function identityProvider(): IdentityProvider {
  return keycloak;
}
