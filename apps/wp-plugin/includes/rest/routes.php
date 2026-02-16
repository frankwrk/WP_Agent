<?php

namespace WP_Agent_Runtime\Rest;

if (!defined('ABSPATH')) exit;

require_once __DIR__ . '/tools/manifest.php';
// (later) require_once tool modules: site.php, content.php, seo.php, jobs.php, rollback.php

class Routes
{
    public static function register()
    {
        register_rest_route('wp-agent/v1', '/manifest', [
            'methods' => 'GET',
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
            'callback' => ['WP_Agent_Runtime\\Rest\\Tools\\Manifest', 'handle'],
        ]);
    }
}
