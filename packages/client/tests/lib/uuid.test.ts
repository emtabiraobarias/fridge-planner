import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUuid } from '../../src/lib/uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid — works outside a secure context (user-reported mobile bug)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when it exists (secure context: https / localhost)', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID });
    expect(randomUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to getRandomValues when randomUUID is absent — the phone-over-HTTP case', () => {
    // Reproduces the reported failure exactly: over plain HTTP on a LAN address
    // `crypto.randomUUID` is undefined, so calling it threw
    // "crypto.randomUUID is not a function" and the meal never saved.
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: real.getRandomValues.bind(real),
      // randomUUID deliberately absent
    });
    const id = randomUuid();
    expect(id).toMatch(UUID_V4);
  });

  it('still returns a valid v4 UUID with no WebCrypto at all', () => {
    vi.stubGlobal('crypto', undefined);
    const id = randomUuid();
    expect(id).toMatch(UUID_V4);
  });

  it('produces distinct ids (no collisions across a batch)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const ids = new Set(Array.from({ length: 500 }, () => randomUuid()));
    expect(ids.size).toBe(500);
  });

  it('sets the version and variant bits the server’s z.string().uuid() requires', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    for (let i = 0; i < 50; i += 1) {
      const id = randomUuid();
      expect(id[14]).toBe('4'); // version nibble
      expect(['8', '9', 'a', 'b']).toContain(id[19]); // variant nibble
    }
  });
});
