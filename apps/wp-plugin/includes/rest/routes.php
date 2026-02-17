<?php

namespace WP_Agent_Runtime\Rest;

if (!defined('ABSPATH')) exit;

require_once __DIR__ . '/tools/manifest.php';
require_once __DIR__ . '/tools/site.php';
require_once __DIR__ . '/tools/content.php';
require_once __DIR__ . '/tools/seo.php';
require_once __DIR__ . '/admin/pair.php';
require_once __DIR__ . '/admin/connect.php';
require_once __DIR__ . '/admin/chat.php';
require_once __DIR__ . '/admin/skills.php';
require_once __DIR__ . '/admin/plans.php';

class Routes
{
    public static function register()
    {
        $toolPermission = function ($request) {
            if (current_user_can('manage_options')) {
                return true;
            }

            return Auth\Signatures::authorizeSignedRequest($request);
        };

        register_rest_route('wp-agent/v1', '/manifest', [
            'methods' => 'GET',
            'permission_callback' => $toolPermission,
            'callback' => ['WP_Agent_Runtime\\Rest\\Tools\\Manifest', 'handle'],
        ]);

        register_rest_route('wp-agent/v1', '/site/environment', [
            'methods' => 'GET',
            'permission_callback' => $toolPermission,
            'callback' => ['WP_Agent_Runtime\\Rest\\Tools\\Site', 'getEnvironment'],
        ]);

        register_rest_route('wp-agent/v1', '/content/inventory', [
            'methods' => 'GET',
            'permission_callback' => $toolPermission,
            'callback' => ['WP_Agent_Runtime\\Rest\\Tools\\Content', 'getInventory'],
        ]);

        register_rest_route('wp-agent/v1', '/seo/config', [
            'methods' => 'GET',
            'permission_callback' => $toolPermission,
            'callback' => ['WP_Agent_Runtime\\Rest\\Tools\\SEO', 'getConfig'],
        ]);

        Admin\Pair::register();
        Admin\Connect::register();
        Admin\Chat::register();
        Admin\Skills::register();
        Admin\Plans::register();
    }
}
