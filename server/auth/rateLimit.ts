/**
 * In-memory sliding-window limiter. State lives in the owning route factory,
 * so each app instance (and each test) gets a fresh counter. Good enough to
 * blunt credential stuffing on a single-process server — it is not a
 * distributed limiter.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  private prune(key: string): number[] {
    const cutoff = Date.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((at) => at > cutoff);
    this.hits.set(key, list);
    return list;
  }

  /** True once `max` hits within the window have already been recorded. */
  exceeded(key: string): boolean {
    return this.prune(key).length >= this.max;
  }

  hit(key: string): void {
    this.prune(key).push(Date.now());
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
