// Staff session signing and simple in-memory rate limiting.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function signSession(secret: string, ttlMs: number, now = Date.now()): string {
  const payload = b64(JSON.stringify({ role: 'staff', exp: now + ttlMs }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.role === 'staff' && typeof data.exp === 'number' && data.exp > now;
  } catch {
    return false;
  }
}

/** Fixed-window limiter keyed by client and action. Adequate for a single booth server. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return {
    take(key: string, now = Date.now()): boolean {
      const h = hits.get(key);
      if (!h || h.reset <= now) {
        hits.set(key, { count: 1, reset: now + windowMs });
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
        return true;
      }
      h.count += 1;
      return h.count <= limit;
    },
  };
}
