<?php

namespace WP_Agent_Runtime\Rest\Tools;

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

    private static function normalizeCsv(string $raw): array
    {
        $values = array_map('trim', explode(',', $raw));
        $values = array_filter($values, function ($value) {
            return $value !== '';
        });

        return array_values(array_unique($values));
    }
}
