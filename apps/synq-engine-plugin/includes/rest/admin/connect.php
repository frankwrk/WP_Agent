<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Rest\Auth\Nonces;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Connect
{
    public static function register(): void
    {
        register_rest_route('wp-agent-admin/v1', '/connect/status', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'status'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/connect/settings', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'settings'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/connect/settings', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'updateSettings'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/connect/test-connection', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'testConnection'],
        ]);
    }

    public static function permission(\WP_REST_Request $request)
    {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
        }

        return Nonces::verifyRestNonceOrError($request);
    }

    public static function status(\WP_REST_Request $request)
    {
        return rest_ensure_response([
            'ok' => true,
            'data' => self::statusData(),
            'error' => null,
            'meta' => null,
        ]);
    }

    public static function settings(\WP_REST_Request $request)
    {
        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'backend_base_url' => Options::backendBaseUrl(),
            ],
            'error' => null,
            'meta' => null,
        ]);
    }

    public static function updateSettings(\WP_REST_Request $request)
    {
        $rawBackendBaseUrl = (string) $request->get_param('backend_base_url');
        if (!Options::setBackendBaseUrl($rawBackendBaseUrl)) {
            return new \WP_Error(
                'wp_agent_backend_url_invalid',
                'Backend URL must be a valid http/https URL',
                ['status' => 400]
            );
        }

        return rest_ensure_response([
            'ok' => true,
            'data' => self::statusData(),
            'error' => null,
            'meta' => [
                'message' => 'Backend URL saved',
            ],
        ]);
    }

    public static function testConnection(\WP_REST_Request $request)
    {
        $requestedBaseUrl = (string) $request->get_param('backend_base_url');
        $backendBaseUrl = $requestedBaseUrl !== ''
            ? Options::sanitizeBackendBaseUrl($requestedBaseUrl)
            : Options::backendBaseUrl();

        if ($backendBaseUrl === '') {
            return new \WP_Error(
                'wp_agent_backend_url_invalid',
                'Backend URL must be a valid http/https URL',
                ['status' => 400]
            );
        }

        $healthUrl = rtrim($backendBaseUrl, '/') . '/api/v1/health';
        $response = wp_remote_get($healthUrl, [
            'timeout' => 10,
            'headers' => [
                'Accept' => 'application/json',
            ],
        ]);

        if (is_wp_error($response)) {
            return rest_ensure_response([
                'ok' => true,
                'data' => [
                    'connected' => false,
                    'status_code' => 0,
                    'backend_base_url' => $backendBaseUrl,
                    'message' => $response->get_error_message(),
                ],
                'error' => null,
                'meta' => null,
            ]);
        }

        $statusCode = wp_remote_retrieve_response_code($response);
        $decoded = json_decode(wp_remote_retrieve_body($response), true);
        $backendOk = is_array($decoded) && !empty($decoded['ok']);
        $connected = $statusCode >= 200 && $statusCode < 300 && $backendOk;
        $message = $connected
            ? 'Connected'
            : 'Health check failed';

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'connected' => $connected,
                'status_code' => $statusCode,
                'backend_base_url' => $backendBaseUrl,
                'message' => $message,
            ],
            'error' => null,
            'meta' => null,
        ]);
    }

    private static function statusData(): array
    {
        $identity = Options::ensureInstallationIdentity();
        $pairedAt = Options::get(Constants::OPTION_PAIRED_AT);

        return [
            'installation_id' => $identity['installation_id'],
            'paired' => $pairedAt !== '' && Options::backendPublicKey() !== '',
            'paired_at' => $pairedAt,
            'backend_base_url' => Options::backendBaseUrl(),
            'backend_audience' => Options::backendAudience() !== '' ? Options::backendAudience() : Constants::backendAudience(),
            'signature_alg' => $identity['signature_alg'],
        ];
    }
}
