<?php

namespace WP_Agent_Runtime\Rest\Tools;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Jobs\Scheduler;
use WP_Agent_Runtime\Storage\Audit_Log;
use WP_Agent_Runtime\Storage\Rollback_Store;

if (!defined('ABSPATH')) exit;

class Content
{
    public static function getInventory(\WP_REST_Request $request)
    {
        $postTypesRaw = trim((string) $request->get_param('post_types'));
        $statusesRaw = trim((string) $request->get_param('statuses'));

        $postTypes = self::normalizeCsv($postTypesRaw !== '' ? $postTypesRaw : 'post,page');
        $statuses = self::normalizeCsv($statusesRaw !== '' ? $statusesRaw : 'publish,draft,pending,private');

        $allowedPostTypes = get_post_types(['public' => true], 'names');
        $postTypes = array_values(array_filter($postTypes, function ($type) use ($allowedPostTypes) {
            return in_array($type, $allowedPostTypes, true);
        }));

        if (empty($postTypes)) {
            $postTypes = ['post', 'page'];
        }

        $allowedStatuses = get_post_stati([], 'names');
        $statuses = array_values(array_filter($statuses, function ($status) use ($allowedStatuses) {
            return in_array($status, $allowedStatuses, true);
        }));

        if (empty($statuses)) {
            $statuses = ['publish', 'draft'];
        }

        $page = max(1, intval($request->get_param('page') ?: 1, 10));
        $perPage = intval($request->get_param('per_page') ?: 20, 10);
        $perPage = max(1, min($perPage, 100));

        $counts = [];
        foreach ($postTypes as $postType) {
            $typeCounts = wp_count_posts($postType);
            $counts[$postType] = [];
            foreach ($statuses as $status) {
                $counts[$postType][$status] = intval($typeCounts->{$status} ?? 0, 10);
            }
        }

        $query = new \WP_Query([
            'post_type' => $postTypes,
            'post_status' => $statuses,
            'posts_per_page' => $perPage,
            'paged' => $page,
            'orderby' => 'modified',
            'order' => 'DESC',
            'fields' => 'ids',
            'ignore_sticky_posts' => true,
            'no_found_rows' => false,
        ]);

        $items = [];
        foreach ($query->posts as $postId) {
            $post = get_post($postId);
            if (!$post instanceof \WP_Post) {
                continue;
            }

            $items[] = [
                'id' => $post->ID,
                'post_type' => $post->post_type,
                'status' => $post->post_status,
                'title' => get_the_title($post),
                'slug' => $post->post_name,
                'date_gmt' => $post->post_date_gmt,
                'modified_gmt' => $post->post_modified_gmt,
                'author_id' => intval($post->post_author, 10),
            ];
        }

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'summary' => [
                    'counts_by_type_status' => $counts,
                    'total_items' => intval($query->found_posts, 10),
                    'post_types' => $postTypes,
                    'statuses' => $statuses,
                ],
                'items' => $items,
                'pagination' => [
                    'page' => $page,
                    'per_page' => $perPage,
                    'total_items' => intval($query->found_posts, 10),
                    'total_pages' => intval($query->max_num_pages, 10),
                ],
            ],
            'error' => null,
            'meta' => [
                'tool' => 'content.inventory',
            ],
        ]);
    }

    public static function createPage(\WP_REST_Request $request)
    {
        $runId = trim((string) $request->get_param('run_id'));
        $stepId = trim((string) $request->get_param('step_id'));

        try {
            $result = self::createDraftPageFromPayload(
                [
                    'title' => $request->get_param('title'),
                    'slug' => $request->get_param('slug'),
                    'content' => $request->get_param('content'),
                    'excerpt' => $request->get_param('excerpt'),
                    'meta' => $request->get_param('meta'),
                ],
                $runId,
                $stepId,
            );
        } catch (\Throwable $error) {
            return new \WP_Error(
                'wp_agent_content_create_failed',
                $error->getMessage(),
                ['status' => 400]
            );
        }

        $toolCallId = trim((string) $request->get_header('x-wp-agent-toolcallid'));
        Audit_Log::log([
            'run_id' => $runId,
            'step_id' => $stepId,
            'tool_name' => 'content.create_page',
            'action' => 'create_draft',
            'actor' => current_user_can('manage_options') ? 'admin' : 'backend_signed',
            'tool_call_id' => $toolCallId,
            'request_payload' => [
                'title' => (string) $request->get_param('title'),
                'slug' => (string) $request->get_param('slug'),
            ],
            'response_payload' => $result,
        ]);

        return rest_ensure_response([
            'ok' => true,
            'data' => $result,
            'error' => null,
            'meta' => [
                'tool' => 'content.create_page',
            ],
        ]);
    }

    public static function bulkCreate(\WP_REST_Request $request)
    {
        $runId = trim((string) $request->get_param('run_id'));
        $stepId = trim((string) $request->get_param('step_id'));
        $items = $request->get_param('items');

        if (!is_array($items) || empty($items)) {
            return new \WP_Error(
                'wp_agent_bulk_items_required',
                'items[] is required',
                ['status' => 400]
            );
        }

        $maxItems = Constants::bulkCreateMaxItems();
        if (count($items) > $maxItems) {
            return new \WP_Error(
                'wp_agent_bulk_items_exceeded',
                sprintf('items[] exceeds max allowed (%d)', $maxItems),
                ['status' => 400]
            );
        }

        $normalizedItems = [];
        foreach ($items as $index => $item) {
            try {
                $normalizedItems[] = self::normalizeDraftPayload($item, $index);
            } catch (\Throwable $error) {
                return new \WP_Error(
                    'wp_agent_bulk_items_invalid',
                    $error->getMessage(),
                    ['status' => 400]
                );
            }
        }

        $job = Scheduler::enqueueBulkCreateJob($runId, $stepId, $normalizedItems);

        $toolCallId = trim((string) $request->get_header('x-wp-agent-toolcallid'));
        Audit_Log::log([
            'run_id' => $runId,
            'step_id' => $stepId,
            'tool_name' => 'content.bulk_create',
            'action' => 'queue_job',
            'actor' => current_user_can('manage_options') ? 'admin' : 'backend_signed',
            'tool_call_id' => $toolCallId,
            'request_payload' => [
                'item_count' => count($normalizedItems),
                'max_items' => $maxItems,
            ],
            'response_payload' => $job,
        ]);

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'job_id' => $job['job_id'],
                'status' => 'queued',
                'accepted_items' => count($normalizedItems),
            ],
            'error' => null,
            'meta' => [
                'tool' => 'content.bulk_create',
            ],
        ]);
    }

    public static function createDraftPageFromPayload(array $payload, string $runId, string $stepId): array
    {
        $normalized = self::normalizeDraftPayload($payload);

        $postId = wp_insert_post([
            'post_type' => 'page',
            'post_status' => 'draft',
            'post_title' => $normalized['title'],
            'post_name' => $normalized['slug'],
            'post_content' => $normalized['content'],
            'post_excerpt' => $normalized['excerpt'],
        ], true);

        if (is_wp_error($postId)) {
            throw new \RuntimeException($postId->get_error_message());
        }

        foreach ($normalized['meta'] as $key => $value) {
            if (!is_string($key) || $key === '') {
                continue;
            }
            update_post_meta(intval($postId, 10), $key, $value);
        }

        $handle = Rollback_Store::addHandle([
            'run_id' => $runId,
            'step_id' => $stepId,
            'kind' => 'delete_post',
            'target_post_id' => intval($postId, 10),
            'payload' => [
                'post_id' => intval($postId, 10),
                'post_type' => 'page',
            ],
        ]);

        return [
            'item' => [
                'id' => intval($postId, 10),
                'post_type' => 'page',
                'status' => 'draft',
                'title' => get_the_title(intval($postId, 10)),
                'slug' => get_post_field('post_name', intval($postId, 10)),
                'link' => get_permalink(intval($postId, 10)),
            ],
            'rollback_handle' => [
                'handle_id' => $handle['handle_id'],
                'kind' => $handle['kind'],
                'payload' => $handle['payload'],
            ],
        ];
    }

    private static function normalizeDraftPayload($payload, int $index = 0): array
    {
        if (!is_array($payload)) {
            throw new \InvalidArgumentException(sprintf('items[%d] must be an object', $index));
        }

        $title = trim((string) ($payload['title'] ?? ''));
        if ($title === '') {
            throw new \InvalidArgumentException(sprintf('items[%d].title is required', $index));
        }

        $slug = sanitize_title((string) ($payload['slug'] ?? ''));
        $content = (string) ($payload['content'] ?? '');
        $excerpt = (string) ($payload['excerpt'] ?? '');

        $meta = [];
        if (isset($payload['meta']) && is_array($payload['meta'])) {
            $meta = $payload['meta'];
        }

        return [
            'title' => $title,
            'slug' => $slug,
            'content' => $content,
            'excerpt' => $excerpt,
            'meta' => $meta,
        ];
    }

    private static function normalizeCsv(string $raw): array
    {
        $values = array_map('trim', explode(',', $raw));
        $values = array_filter($values, function ($value) {
            return $value !== '';
        });

        return array_values(array_unique($values));
    }
}
