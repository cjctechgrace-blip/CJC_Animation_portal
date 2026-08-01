import "server-only";

// Sliding-window login throttle, keyed by email. In-memory: on serverless this
// is per-instance, so it slows credential-stuffing rather than hard-blocking it,
// with zero infrastructure. Successful logins clear the key.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

const failures = new Map<string, number[]>();

function prune(times: number[], now: number): number[] {
  return times.filter((t) => now - t < WINDOW_MS);
}

/** True when this key has failed too often and must wait. */
export function isThrottled(key: string): boolean {
  const now = Date.now();
  const recent = prune(failures.get(key) ?? [], now);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const recent = prune(failures.get(key) ?? [], now);
  recent.push(now);
  failures.set(key, recent);
  // keep the map from growing unboundedly
  if (failures.size > 10_000) {
    for (const [k, v] of failures) {
      if (prune(v, now).length === 0) failures.delete(k);
    }
  }
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
