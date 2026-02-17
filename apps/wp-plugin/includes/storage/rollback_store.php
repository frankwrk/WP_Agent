<?php

namespace WP_Agent_Runtime\Storage;

if (!defined('ABSPATH')) exit;

class Rollback_Store
{
    private static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'wp_agent_rollback_handles';
    }

    public static function addHandle(array $input): array
    {
        global $wpdb;

        $handleId = wp_generate_uuid4();
        $payload = isset($input['payload']) ? wp_json_encode($input['payload']) : null;

        $wpdb->insert(
            self::table(),
            [
                'handle_id' => $handleId,
                'run_id' => (string) ($input['run_id'] ?? ''),
                'step_id' => (string) ($input['step_id'] ?? ''),
                'kind' => (string) ($input['kind'] ?? ''),
                'target_post_id' => isset($input['target_post_id']) ? intval($input['target_post_id'], 10) : null,
                'revision_id' => isset($input['revision_id']) ? intval($input['revision_id'], 10) : null,
                'payload' => $payload,
                'status' => 'pending',
                'error' => null,
                'created_at' => gmdate('Y-m-d H:i:s'),
                'updated_at' => gmdate('Y-m-d H:i:s'),
                'applied_at' => null,
            ],
            [
                '%s',
                '%s',
                '%s',
                '%s',
                '%d',
                '%d',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
            ]
        );

        return [
            'handle_id' => $handleId,
            'run_id' => (string) ($input['run_id'] ?? ''),
            'step_id' => (string) ($input['step_id'] ?? ''),
            'kind' => (string) ($input['kind'] ?? ''),
            'target_post_id' => isset($input['target_post_id']) ? intval($input['target_post_id'], 10) : null,
            'revision_id' => isset($input['revision_id']) ? intval($input['revision_id'], 10) : null,
            'payload' => is_array($input['payload'] ?? null) ? $input['payload'] : [],
            'status' => 'pending',
        ];
    }

    public static function listByRun(string $runId, string $status = ''): array
    {
        global $wpdb;

        $table = self::table();
        if ($status !== '') {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE run_id = %s AND status = %s ORDER BY created_at ASC",
                    $runId,
                    $status
                ),
                ARRAY_A
            );
        } else {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE run_id = %s ORDER BY created_at ASC",
                    $runId
                ),
                ARRAY_A
            );
        }

        $items = [];
        foreach ($rows as $row) {
            $items[] = self::normalizeRow($row);
        }

        return $items;
    }

    public static function markApplied(string $handleId): void
    {
        global $wpdb;

        $wpdb->update(
            self::table(),
            [
                'status' => 'applied',
                'error' => null,
                'updated_at' => gmdate('Y-m-d H:i:s'),
                'applied_at' => gmdate('Y-m-d H:i:s'),
            ],
            [
                'handle_id' => $handleId,
            ],
            [
                '%s',
                '%s',
                '%s',
                '%s',
            ],
            ['%s']
        );
    }

    public static function markFailed(string $handleId, string $error): void
    {
        global $wpdb;

        $wpdb->update(
            self::table(),
            [
                'status' => 'failed',
                'error' => $error,
                'updated_at' => gmdate('Y-m-d H:i:s'),
            ],
            [
                'handle_id' => $handleId,
            ],
            [
                '%s',
                '%s',
                '%s',
            ],
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

        return [
            'handle_id' => (string) ($row['handle_id'] ?? ''),
            'run_id' => (string) ($row['run_id'] ?? ''),
            'step_id' => (string) ($row['step_id'] ?? ''),
            'kind' => (string) ($row['kind'] ?? ''),
            'target_post_id' => isset($row['target_post_id']) ? intval($row['target_post_id'], 10) : null,
            'revision_id' => isset($row['revision_id']) ? intval($row['revision_id'], 10) : null,
            'payload' => $payload,
            'status' => (string) ($row['status'] ?? ''),
            'error' => isset($row['error']) ? (string) $row['error'] : null,
            'created_at' => (string) ($row['created_at'] ?? ''),
            'updated_at' => (string) ($row['updated_at'] ?? ''),
            'applied_at' => isset($row['applied_at']) ? (string) $row['applied_at'] : null,
        ];
    }
}
