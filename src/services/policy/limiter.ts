export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private readonly counts = new Map<string, { count: number; expiresAt: number }>();

  public check(key: string, limitPerWindow: number, windowSeconds: number): RateLimitResult {
    const now = Math.floor(Date.now() / 1000);
    const start = Math.floor(now / windowSeconds) * windowSeconds;
    const bucket = `${key}:${start}`;

    const current = this.counts.get(bucket)?.count ?? 0;
    this.counts.set(bucket, {
      count: current + 1,
      expiresAt: start + windowSeconds,
    });

    if (this.counts.size > 2000) {
      for (const [entryKey, entry] of this.counts.entries()) {
        if (entry.expiresAt <= now) {
          this.counts.delete(entryKey);
        }
      }
    }

    return {
      allowed: current + 1 <= limitPerWindow,
      retryAfterSeconds: Math.max(1, start + windowSeconds - now),
    };
  }
}
