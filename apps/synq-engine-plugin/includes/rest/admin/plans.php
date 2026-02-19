<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Rest\Auth\Nonces;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Plans
{
    public static function register(): void
    {
        register_rest_route('wp-agent-admin/v1', '/plans/draft', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'draft'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/plans/(?P<plan_id>[0-9a-fA-F-]+)', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'getPlan'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/plans/(?P<plan_id>[0-9a-fA-F-]+)/approve', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'approve'],
        ]);
    }

    public static function permission(\WP_REST_Request $request)
    {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
        }

        return Nonces::verifyRestNonceOrError($request);
    }

    public static function draft(\WP_REST_Request $request)
    {
        $skillId = trim((string) $request->get_param('skill_id'));
        $goal = trim((string) $request->get_param('goal'));
        $policyPreset = strtolower(trim((string) $request->get_param('policy_preset')));

        if ($policyPreset === '') {
            $policyPreset = 'balanced';
        }

        $inputs = $request->get_param('inputs');
        if (!is_array($inputs)) {
            $inputs = [];
        }

        return self::backendProxy(
            'POST',
            '/api/v1/plans/draft',
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
                'policy_preset' => $policyPreset,
                'skill_id' => $skillId,
                'goal' => $goal,
                'inputs' => $inputs,
            ]
        );
    }

    public static function getPlan(\WP_REST_Request $request)
    {
        $planId = trim((string) $request->get_param('plan_id'));
        if ($planId === '') {
            return new \WP_Error('wp_agent_plan_missing', 'plan_id is required', ['status' => 400]);
        }

        return self::backendProxy(
            'GET',
            '/api/v1/plans/' . rawurlencode($planId),
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
            ]
        );
    }

    public static function approve(\WP_REST_Request $request)
    {
        $planId = trim((string) $request->get_param('plan_id'));
        if ($planId === '') {
            return new \WP_Error('wp_agent_plan_missing', 'plan_id is required', ['status' => 400]);
        }

        return self::backendProxy(
            'POST',
            '/api/v1/plans/' . rawurlencode($planId) . '/approve',
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
