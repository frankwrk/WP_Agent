"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedWindowRateLimiter = void 0;
class FixedWindowRateLimiter {
    counts = new Map();
    check(key, limitPerWindow, windowSeconds) {
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
exports.FixedWindowRateLimiter = FixedWindowRateLimiter;
