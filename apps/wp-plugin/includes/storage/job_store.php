<?php

namespace WP_Agent_Runtime\Storage;

if (!defined('ABSPATH')) exit;

class Job_Store
{
    private static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'wp_agent_jobs';
    }

    public static function createQueued(array $input): string
    {
        global $wpdb;

        $jobId = wp_generate_uuid4();
        $payload = wp_json_encode($input['payload'] ?? []);

        $wpdb->insert(
            self::table(),
            [
                'job_id' => $jobId,
                'run_id' => (string) ($input['run_id'] ?? ''),
                'step_id' => (string) ($input['step_id'] ?? ''),
                'status' => 'queued',
                'scheduler' => (string) ($input['scheduler'] ?? 'wp_cron'),
                'total_items' => max(0, intval($input['total_items'] ?? 0, 10)),
                'processed_items' => 0,
                'created_items' => 0,
                'failed_items' => 0,
                'payload' => $payload,
                'result' => null,
                'error' => null,
                'created_at' => gmdate('Y-m-d H:i:s'),
                'updated_at' => gmdate('Y-m-d H:i:s'),
                'started_at' => null,
                'finished_at' => null,
            ],
            [
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%d',
                '%d',
                '%d',
                '%d',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
            ]
        );

        return $jobId;
    }

    public static function get(string $jobId): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT * FROM ' . self::table() . ' WHERE job_id = %s LIMIT 1',
                $jobId
            ),
            ARRAY_A
        );

        if (!is_array($row)) {
            return null;
        }

        return self::normalizeRow($row);
    }

    public static function markRunning(string $jobId): void
    {
        global $wpdb;

        $wpdb->update(
            self::table(),
            [
                'status' => 'running',
                'updated_at' => gmdate('Y-m-d H:i:s'),
                'started_at' => gmdate('Y-m-d H:i:s'),
            ],
            ['job_id' => $jobId],
            ['%s', '%s', '%s'],
            ['%s']
        );
    }

    public static function markCompleted(string $jobId, array $progress, array $result): void
    {
        global $wpdb;

        $wpdb->update(
            self::table(),
            [
                'status' => 'completed',
                'processed_items' => max(0, intval($progress['processed_items'] ?? 0, 10)),
                'created_items' => max(0, intval($progress['created_items'] ?? 0, 10)),
                'failed_items' => max(0, intval($progress['failed_items'] ?? 0, 10)),
                'result' => wp_json_encode($result),
                'error' => null,
                'updated_at' => gmdate('Y-m-d H:i:s'),
                'finished_at' => gmdate('Y-m-d H:i:s'),
            ],
            ['job_id' => $jobId],
            ['%s', '%d', '%d', '%d', '%s', '%s', '%s', '%s'],
            ['%s']
        );
    }

    public static function markFailed(string $jobId, array $progress, string $error, array $result = []): void
    {
        global $wpdb;

        $wpdb->update(
            self::table(),
            [
                'status' => 'failed',
                'processed_items' => max(0, intval($progress['processed_items'] ?? 0, 10)),
                'created_items' => max(0, intval($progress['created_items'] ?? 0, 10)),
                'failed_items' => max(0, intval($progress['failed_items'] ?? 0, 10)),
                'result' => wp_json_encode($result),
                'error' => $error,
                'updated_at' => gmdate('Y-m-d H:i:s'),
                'finished_at' => gmdate('Y-m-d H:i:s'),
            ],
            ['job_id' => $jobId],
            ['%s', '%d', '%d', '%d', '%s', '%s', '%s', '%s'],
            ['%s']
        );
    }

    private static function normalizeRow(array $row): array
    {
        $payload = [];
        if (!empty($row['payload'])) {
            $decoded = json_decode((string) $row['payload'], true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        $result = [];
        if (!empty($row['result'])) {
            $decoded = json_decode((string) $row['result'], true);
            if (is_array($decoded)) {
                $result = $decoded;
            }
        }

        return [
            'job_id' => (string) ($row['job_id'] ?? ''),
            'run_id' => (string) ($row['run_id'] ?? ''),
            'step_id' => (string) ($row['step_id'] ?? ''),
            'status' => (string) ($row['status'] ?? ''),
            'scheduler' => (string) ($row['scheduler'] ?? ''),
            'total_items' => intval($row['total_items'] ?? 0, 10),
            'processed_items' => intval($row['processed_items'] ?? 0, 10),
            'created_items' => intval($row['created_items'] ?? 0, 10),
            'failed_items' => intval($row['failed_items'] ?? 0, 10),
            'payload' => $payload,
            'result' => $result,
            'error' => isset($row['error']) ? (string) $row['error'] : null,
            'created_at' => (string) ($row['created_at'] ?? ''),
            'updated_at' => (string) ($row['updated_at'] ?? ''),
            'started_at' => isset($row['started_at']) ? (string) $row['started_at'] : null,
            'finished_at' => isset($row['finished_at']) ? (string) $row['finished_at'] : null,
        ];
    }
}
