<?php

namespace WP_Agent_Runtime\Rest\Tools;

if (!defined('ABSPATH')) exit;

class Site
{
    public static function getEnvironment(\WP_REST_Request $request)
    {
        $theme = wp_get_theme();

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'site_url' => get_site_url(),
                'home_url' => home_url(),
                'wp_version' => get_bloginfo('version'),
                'php_version' => PHP_VERSION,
                'locale' => get_locale(),
                'timezone' => wp_timezone_string(),
                'active_theme' => [
                    'name' => $theme->get('Name'),
                    'version' => $theme->get('Version'),
                    'stylesheet' => $theme->get_stylesheet(),
                    'template' => $theme->get_template(),
                ],
                'permalink_structure' => get_option('permalink_structure'),
                'is_multisite' => is_multisite(),
            ],
            'error' => null,
            'meta' => [
                'tool' => 'site.get_environment',
            ],
        ]);
    }
}
