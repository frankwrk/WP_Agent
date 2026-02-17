<?php

namespace WP_Agent_Runtime\Rest\Tools;

use WP_Agent_Runtime\Storage\Audit_Log;
use WP_Agent_Runtime\Storage\Rollback_Store;

if (!defined('ABSPATH')) exit;

class Rollback
{
    public static function apply(\WP_REST_Request $request)
    {
        $runId = trim((string) $request->get_param('run_id'));
        if ($runId === '') {
            return new \WP_Error('wp_agent_run_id_missing', 'run_id is required', ['status' => 400]);
        }

        $handleIds = $request->get_param('handle_ids');
        $allowSet = null;
        if (is_array($handleIds) && !empty($handleIds)) {
            $allowSet = array_values(array_unique(array_map(function ($value) {
                return trim((string) $value);
            }, $handleIds)));
        }

        $handles = Rollback_Store::listByRun($runId, 'pending');
        if ($allowSet !== null) {
            $handles = array_values(array_filter($handles, function ($handle) use ($allowSet) {
                return in_array((string) ($handle['handle_id'] ?? ''), $allowSet, true);
            }));
        }

        $results = [];
        $applied = 0;
        $failed = 0;

        foreach ($handles as $handle) {
            $handleId = (string) ($handle['handle_id'] ?? '');
            $kind = (string) ($handle['kind'] ?? '');

            try {
                if ($kind === 'delete_post') {
                    $postId = intval($handle['target_post_id'] ?? 0, 10);
                    if ($postId <= 0) {
                        throw new \RuntimeException('delete_post handle missing target_post_id');
                    }

                    $deleted = wp_delete_post($postId, true);
                    if ($deleted === false) {
                        throw new \RuntimeException('Failed to delete post during rollback');
                    }
                } elseif ($kind === 'restore_revision') {
                    $revisionId = intval($handle['revision_id'] ?? 0, 10);
                    if ($revisionId <= 0) {
                        throw new \RuntimeException('restore_revision handle missing revision_id');
                    }

                    $restored = wp_restore_post_revision($revisionId);
                    if ($restored === false || is_wp_error($restored)) {
                        throw new \RuntimeException('Failed to restore revision during rollback');
                    }
                } else {
                    throw new \RuntimeException('Unsupported rollback handle kind: ' . $kind);
                }

                Rollback_Store::markApplied($handleId);
                $applied += 1;
                $results[] = [
                    'handle_id' => $handleId,
                    'status' => 'applied',
                ];
            } catch (\Throwable $error) {
                Rollback_Store::markFailed($handleId, $error->getMessage());
                $failed += 1;
                $results[] = [
                    'handle_id' => $handleId,
                    'status' => 'failed',
                    'error' => $error->getMessage(),
                ];
            }
        }

        Audit_Log::log([
            'run_id' => $runId,
            'step_id' => 'rollback',
            'tool_name' => 'rollback.apply',
            'action' => 'apply',
            'actor' => current_user_can('manage_options') ? 'admin' : 'backend_signed',
            'tool_call_id' => trim((string) $request->get_header('x-wp-agent-toolcallid')),
            'request_payload' => [
                'handle_ids' => $allowSet,
                'pending_count' => count($handles),
            ],
            'response_payload' => [
                'summary' => [
                    'total' => count($handles),
                    'applied' => $applied,
                    'failed' => $failed,
                ],
                'results' => $results,
            ],
        ]);

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'run_id' => $runId,
                'summary' => [
                    'total' => count($handles),
                    'applied' => $applied,
                    'failed' => $failed,
                ],
                'results' => $results,
            ],
            'error' => null,
            'meta' => [
                'tool' => 'rollback.apply',
            ],
        ]);
    }
}
