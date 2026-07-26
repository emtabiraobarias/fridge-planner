/**
 * A RFC-4122 v4 UUID that works in **non-secure contexts**.
 *
 * `crypto.randomUUID()` is gated to secure contexts (HTTPS or `localhost`). It is
 * therefore `undefined` when the app is opened over plain HTTP on a LAN address —
 * exactly how a phone or tablet reaches a dev server (`http://192.168.x.x:3000`).
 * Calling it there throws `crypto.randomUUID is not a function`, which is how this
 * surfaced: placing a meal worked on desktop (localhost = secure) and failed on a
 * real phone (LAN IP = not secure).
 *
 * `crypto.getRandomValues()` is **not** secure-context gated, so it is a genuine
 * CSPRNG fallback rather than a downgrade. `Math.random()` is a last resort for
 * environments without WebCrypto at all; ids here are slot identifiers, never
 * secrets, so that floor is acceptable.
 *
 * The output must satisfy `z.string().uuid()` server-side
 * (`src/server/controllers/meal-plans.ts`), so version and variant bits are set
 * explicitly rather than relying on formatting alone.
 */
export function randomUuid(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;

  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Version 4 (0100xxxx) and RFC-4122 variant (10xxxxxx).
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
