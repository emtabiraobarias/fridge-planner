import { act, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthBanner } from '../../src/components/shared/AuthBanner';
import { ensureOk, AuthRequiredError } from '../../src/services/http';

function res(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as unknown as Response;
}

describe('AuthBanner (FR-D-009)', () => {
  it('renders nothing until a 401 occurs', () => {
    render(<AuthBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a re-authentication prompt when the API returns 401', () => {
    render(<AuthBanner />);
    act(() => {
      expect(() => ensureOk(res(401), 'fetch inventory')).toThrow(AuthRequiredError);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/sign in/i);
  });

  it('ignores non-401 errors (generic Error, no prompt)', () => {
    render(<AuthBanner />);
    act(() => {
      expect(() => ensureOk(res(500), 'fetch inventory')).toThrow(/Failed to fetch inventory: 500/);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
