import 'server-only';
import { authenticatePrincipal, type Principal } from './auth';
import { ForbiddenError } from './auth-errors';

/**
 * Resolve the caller and require the administrator role (spec 011 FR-AD-002/003).
 *
 * Every administrator-only handler calls this as its authorization step, so the
 * decision sits next to the thing it protects rather than in shared middleware —
 * and, critically, holds regardless of whether any UI exposes the action
 * (FR-AD-002). Hiding a control is never the enforcement.
 *
 * Failure modes stay distinguishable (FR-AD-003):
 *  - not authenticated  → AuthError      → 401
 *  - authenticated, not admin → ForbiddenError → 403
 */
export async function requirePrincipalAdmin(request: Request): Promise<Principal> {
  const principal = await authenticatePrincipal(request);
  if (!principal.isAdmin) {
    throw new ForbiddenError('Administrator privileges are required for this action');
  }
  return principal;
}
