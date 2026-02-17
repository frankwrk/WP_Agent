<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Rest\Auth\Nonces;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Runs
{
    public static function register(): void
    {
        register_rest_route('wp-agent-admin/v1', '/runs', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'createRun'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/runs/(?P<run_id>[0-9a-fA-F-]+)', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'getRun'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/runs/(?P<run_id>[0-9a-fA-F-]+)/rollback', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'rollbackRun'],
        ]);
    }

    public static function permission(\WP_REST_Request $request)
    {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
        }

        return Nonces::verifyRestNonceOrError($request);
    }

    public static function createRun(\WP_REST_Request $request)
    {
        $planId = trim((string) $request->get_param('plan_id'));

        return self::backendProxy(
            'POST',
            '/api/v1/runs',
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
                'plan_id' => $planId,
            ]
        );
    }

    public static function getRun(\WP_REST_Request $request)
    {
        $runId = trim((string) $request->get_param('run_id'));
        if ($runId === '') {
            return new \WP_Error('wp_agent_run_missing', 'run_id is required', ['status' => 400]);
        }

        return self::backendProxy(
            'GET',
            '/api/v1/runs/' . rawurlencode($runId),
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
            ]
        );
    }

    public static function rollbackRun(\WP_REST_Request $request)
    {
        $runId = trim((string) $request->get_param('run_id'));
        if ($runId === '') {
            return new \WP_Error('wp_agent_run_missing', 'run_id is required', ['status' => 400]);
        }

        return self::backendProxy(
            'POST',
            '/api/v1/runs/' . rawurlencode($runId) . '/rollback',
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
            ]
        );
    }

    private static function installationId(): string
    {
        $identity = Options::ensureInstallationIdentity();
        return (string) ($identity['installation_id'] ?? '');
    }

    private static function backendProxy(string $method, string $path, array $payload)
    {
        $result = self::backendProxyRaw($method, $path, $payload);
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    private static function backendProxyRaw(string $method, string $path, array $payload)
    {
        $bootstrapSecret = Constants::pairingBootstrapSecret();
        if ($bootstrapSecret === '') {
            return new \WP_Error(
                'wp_agent_bootstrap_secret_missing',
                'PAIRING_BOOTSTRAP_SECRET is not configured',
                ['status' => 500]
            );
        }

        $backendBaseUrl = Options::backendBaseUrl();
        if ($backendBaseUrl === '') {
            $backendBaseUrl = Constants::backendBaseUrl();
        }

        $url = rtrim($backendBaseUrl, '/') . $path;

        $args = [
            'method' => $method,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-WP-Agent-Bootstrap' => $bootstrapSecret,
            ],
            'timeout' => 30,
        ];

        if ($method === 'GET') {
            $query = http_build_query(array_filter($payload, function ($value) {
                return $value !== null && $value !== '';
            }));
            if ($query !== '') {
                $url .= '?' . $query;
            }
        } else {
            $args['body'] = wp_json_encode($payload);
        }

        $response = wp_remote_request($url, $args);
        if (is_wp_error($response)) {
            return new \WP_Error(
                'wp_agent_backend_unreachable',
                $response->get_error_message(),
                ['status' => 502]
            );
        }

        $statusCode = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);

        if (!is_array($decoded)) {
            return new \WP_Error(
                'wp_agent_backend_invalid_json',
                'Backend returned invalid JSON payload',
                ['status' => 502]
            );
        }

        if ($statusCode < 200 || $statusCode >= 300 || empty($decoded['ok'])) {
            $errorCode = (string) ($decoded['error']['code'] ?? 'BACKEND_REQUEST_FAILED');
            $errorMessage = (string) ($decoded['error']['message'] ?? 'Backend request failed');

            return new \WP_Error(
                'wp_agent_backend_error_' . strtolower($errorCode),
                $errorMessage,
                [
                    'status' => $statusCode >= 400 ? $statusCode : 502,
                    'backend_response' => $decoded,
                ]
            );
        }

        return $decoded;
    }
}
