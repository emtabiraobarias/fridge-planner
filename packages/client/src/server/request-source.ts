import 'server-only';

/**
 * The client's source address, for rate-limiting a signed-out endpoint (research R7).
 *
 * Every other limiter key in this app is `something:${userId}`. Registration and password
 * reset are the first that cannot be — there is no user yet — so the source address is what
 * bounds an attacker without bounding everyone else.
 *
 * Behind Caddy the address must come from the forwarded header, and that header is
 * trustworthy HERE specifically because Caddy is the only ingress and sets it itself
 * (docker-compose.prod.yml publishes no other port). On a deployment where something else
 * could reach the app directly this would be spoofable, and the limit would be worth what the
 * spoofer decides.
 *
 * Falls back to a single shared bucket rather than to "unlimited": an unattributable request
 * should be throttled together with the other unattributable ones, not exempted.
 */
export function sourceAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  return request.headers.get('x-real-ip')?.trim() || 'unknown-source';
}
