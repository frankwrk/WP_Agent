<?php

namespace WP_Agent_Runtime\Rest\Tools;

if (!defined('ABSPATH')) exit;

class Manifest
{
    public static function handle($request)
    {
        $toolBase = rest_url('wp-agent/v1');

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'tools' => [
                    [
                        'name' => 'site.get_environment',
                        'description' => 'Read runtime environment metadata from this WordPress installation',
                        'endpoint' => rtrim($toolBase, '/') . '/site/environment',
                        'method' => 'GET',
                        'readOnly' => true,
                        'safetyClass' => 'read',
                        'costWeight' => 1,
                        'inputSchema' => [
                            'type' => 'object',
                            'properties' => [],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'site_url' => ['type' => 'string'],
                                'wp_version' => ['type' => 'string'],
                                'php_version' => ['type' => 'string'],
                            ],
                        ],
                    ],
                    [
                        'name' => 'content.inventory',
                        'description' => 'Read post/page inventory summary and paginated samples',
                        'endpoint' => rtrim($toolBase, '/') . '/content/inventory',
                        'method' => 'GET',
                        'readOnly' => true,
                        'safetyClass' => 'read',
                        'costWeight' => 2,
                        'inputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'post_types' => ['type' => 'string'],
                                'statuses' => ['type' => 'string'],
                                'page' => ['type' => 'integer'],
                                'per_page' => ['type' => 'integer'],
                            ],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'summary' => ['type' => 'object'],
                                'items' => ['type' => 'array'],
                                'pagination' => ['type' => 'object'],
                            ],
                        ],
                    ],
                    [
                        'name' => 'seo.get_config',
                        'description' => 'Read normalized SEO plugin configuration (Yoast/Rank Math/none)',
                        'endpoint' => rtrim($toolBase, '/') . '/seo/config',
                        'method' => 'GET',
                        'readOnly' => true,
                        'safetyClass' => 'read',
                        'costWeight' => 1,
                        'inputSchema' => [
                            'type' => 'object',
                            'properties' => [],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'provider' => ['type' => 'string'],
                                'enabled' => ['type' => 'boolean'],
                            ],
                        ],
                    ],
                    [
                        'name' => 'content.create_page',
                        'description' => 'Create a single WordPress page draft and return rollback handle',
                        'endpoint' => rtrim($toolBase, '/') . '/content/create-page',
                        'method' => 'POST',
                        'readOnly' => false,
                        'safetyClass' => 'write_draft',
                        'costWeight' => 4,
                        'inputSchema' => [
                            'type' => 'object',
                            'required' => ['run_id', 'step_id', 'title'],
                            'properties' => [
                                'run_id' => ['type' => 'string'],
                                'step_id' => ['type' => 'string'],
                                'title' => ['type' => 'string'],
                                'slug' => ['type' => 'string'],
                                'content' => ['type' => 'string'],
                                'excerpt' => ['type' => 'string'],
                                'meta' => ['type' => 'object'],
                            ],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'item' => ['type' => 'object'],
                                'rollback_handle' => ['type' => 'object'],
                            ],
                        ],
                    ],
                    [
                        'name' => 'content.bulk_create',
                        'description' => 'Queue async creation of multiple WordPress page drafts',
                        'endpoint' => rtrim($toolBase, '/') . '/content/bulk-create',
                        'method' => 'POST',
                        'readOnly' => false,
                        'safetyClass' => 'write_draft',
                        'costWeight' => 6,
                        'inputSchema' => [
                            'type' => 'object',
                            'required' => ['run_id', 'step_id', 'items'],
                            'properties' => [
                                'run_id' => ['type' => 'string'],
                                'step_id' => ['type' => 'string'],
                                'items' => ['type' => 'array'],
                            ],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'job_id' => ['type' => 'string'],
                                'status' => ['type' => 'string'],
                                'accepted_items' => ['type' => 'integer'],
                            ],
                        ],
                    ],
                    [
                        'name' => 'jobs.get_status',
                        'description' => 'Read async bulk create job status and progress',
                        'endpoint' => rtrim($toolBase, '/') . '/jobs/{job_id}',
                        'method' => 'GET',
                        'readOnly' => true,
                        'safetyClass' => 'read',
                        'costWeight' => 1,
                        'internalOnly' => true,
                        'inputSchema' => [
                            'type' => 'object',
                            'required' => ['job_id'],
                            'properties' => [
                                'job_id' => ['type' => 'string'],
                            ],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'status' => ['type' => 'string'],
                                'progress' => ['type' => 'object'],
                            ],
                        ],
                    ],
                    [
                        'name' => 'rollback.apply',
                        'description' => 'Apply rollback handles for a run',
                        'endpoint' => rtrim($toolBase, '/') . '/rollback/apply',
                        'method' => 'POST',
                        'readOnly' => false,
                        'safetyClass' => 'write_draft',
                        'costWeight' => 2,
                        'internalOnly' => true,
                        'inputSchema' => [
                            'type' => 'object',
                            'required' => ['run_id'],
                            'properties' => [
                                'run_id' => ['type' => 'string'],
                                'handle_ids' => ['type' => 'array'],
                            ],
                        ],
                        'outputSchema' => [
                            'type' => 'object',
                            'properties' => [
                                'summary' => ['type' => 'object'],
                                'results' => ['type' => 'array'],
                            ],
                        ],
                    ],
                ],
                'auth' => [
                    'signature_alg' => 'ed25519',
                    'mode' => 'admin_or_signed',
                ],
            ],
            'error' => null,
            'meta' => [
                'version' => '0.1.0',
                'milestone' => 'M4',
            ],
        ]);
    }
}
