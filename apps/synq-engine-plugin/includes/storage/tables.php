<?php

namespace WP_Agent_Runtime\Storage;

if (!defined('ABSPATH')) exit;

class Tables
{
    public static function idempotencyTable(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'wp_agent_idempotency';
    }

    public static function rateLimitTable(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'wp_agent_rate_limit';
    }

    public static function claimIdempotency(string $installationId, string $toolCallId, int $windowHours): bool
    {
        global $wpdb;

        self::cleanupIdempotency($windowHours, 200);

        $table = self::idempotencyTable();
        $inserted = $wpdb->query(
            $wpdb->prepare(
                "INSERT IGNORE INTO {$table} (installation_id, tool_call_id, created_at) VALUES (%s, %s, UTC_TIMESTAMP())",
                $installationId,
                $toolCallId
            )
        );

        return $inserted === 1;
    }

    public static function cleanupIdempotency(int $windowHours, int $limit): void
    {
        global $wpdb;

        $table = self::idempotencyTable();
        $safeLimit = max(1, min($limit, 1000));
        $cutoff = gmdate('Y-m-d H:i:s', time() - ($windowHours * 3600));

        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE created_at < %s LIMIT {$safeLimit}",
                $cutoff
            )
        );
    }

    public static function checkAndIncrementRateLimit(string $installationId, int $limit, int $windowSeconds): array
    {
        global $wpdb;

        $table = self::rateLimitTable();
        $windowSeconds = max(1, $windowSeconds);
        $bucketStart = intdiv(time(), $windowSeconds) * $windowSeconds;

        $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$table} (installation_id, bucket_start_epoch, request_count, updated_at)\n                 VALUES (%s, %d, 1, UTC_TIMESTAMP())\n                 ON DUPLICATE KEY UPDATE request_count = request_count + 1, updated_at = UTC_TIMESTAMP()",
                $installationId,
                $bucketStart
            )
        );

        $count = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT request_count FROM {$table} WHERE installation_id = %s AND bucket_start_epoch = %d LIMIT 1",
                $installationId,
                $bucketStart
            )
        );

        self::cleanupRateLimitBuckets($bucketStart - ($windowSeconds * 60));

        return [
            'allowed' => $count <= $limit,
            'count' => $count,
            'retry_after' => max(1, ($bucketStart + $windowSeconds) - time()),
        ];
    }

    private static function cleanupRateLimitBuckets(int $olderThanEpoch): void
    {
        global $wpdb;

        $table = self::rateLimitTable();
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE bucket_start_epoch < %d LIMIT 500",
                $olderThanEpoch
            )
        );
    }
}
