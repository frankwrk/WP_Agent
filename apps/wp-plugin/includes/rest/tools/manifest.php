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
                ],
                'auth' => [
                    'signature_alg' => 'ed25519',
                    'mode' => 'admin_or_signed',
                ],
            ],
            'error' => null,
            'meta' => [
                'version' => '0.1.0',
                'milestone' => 'M2',
            ],
        ]);
    }
}
