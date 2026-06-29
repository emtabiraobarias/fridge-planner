// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, setAuthToken } from '../../src/services/http';

describe('apiFetch — Bearer token attachment (E0)', () => {
  beforeEach(() => {
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  it('omits Authorization when no token is set', async () => {
    const f = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', f);
    await apiFetch('/api/v1/inventory');
    const headers = new Headers((f.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches Authorization: Bearer <token> and preserves existing headers', async () => {
    const f = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', f);
    setAuthToken('tok123');
    await apiFetch('/api/v1/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers((f.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer tok123');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
