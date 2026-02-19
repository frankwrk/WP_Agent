<?php

namespace WP_Agent_Runtime\Rest\Admin;

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
        return BackendClient::proxy($method, $path, $payload, 30);
    }
}
