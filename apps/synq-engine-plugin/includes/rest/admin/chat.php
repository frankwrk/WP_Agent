<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Rest\Auth\Nonces;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Chat
{
    public static function register(): void
    {
        register_rest_route('wp-agent-admin/v1', '/chat/sessions', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'createOrResumeSession'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/chat/sessions/current', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'getCurrentSession'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/chat/sessions/(?P<session_id>[0-9a-fA-F-]+)/messages', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'postMessage'],
        ]);
    }

    public static function permission(\WP_REST_Request $request)
    {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
        }

        return Nonces::verifyRestNonceOrError($request);
    }

    public static function createOrResumeSession(\WP_REST_Request $request)
    {
        $policyPreset = strtolower(trim((string) $request->get_param('policy_preset')));
        if ($policyPreset === '') {
            $policyPreset = 'balanced';
        }

        return self::backendProxy(
            'POST',
            '/api/v1/sessions',
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
                'policy_preset' => $policyPreset,
            ]
        );
    }

    public static function getCurrentSession(\WP_REST_Request $request)
    {
        $policyPreset = strtolower(trim((string) $request->get_param('policy_preset')));
        if ($policyPreset === '') {
            $policyPreset = 'balanced';
        }

        $createResponse = self::backendProxyRaw(
            'POST',
            '/api/v1/sessions',
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
                'policy_preset' => $policyPreset,
            ]
        );

        if (is_wp_error($createResponse)) {
            return $createResponse;
        }

        $sessionId = (string) ($createResponse['data']['session']['session_id'] ?? '');
        if ($sessionId === '') {
            return new \WP_Error(
                'wp_agent_chat_session_missing',
                'Backend did not return a session identifier',
                ['status' => 502]
            );
        }

        return self::backendProxy(
            'GET',
            '/api/v1/sessions/' . rawurlencode($sessionId),
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
            ]
        );
    }

    public static function postMessage(\WP_REST_Request $request)
    {
        $sessionId = trim((string) $request->get_param('session_id'));
        if ($sessionId === '') {
            return new \WP_Error(
                'wp_agent_chat_session_missing',
                'session_id is required',
                ['status' => 400]
            );
        }

        $content = trim((string) $request->get_param('content'));

        return self::backendProxy(
            'POST',
            '/api/v1/sessions/' . rawurlencode($sessionId) . '/messages',
            [
                'installation_id' => self::installationId(),
                'wp_user_id' => get_current_user_id(),
                'content' => $content,
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
        return BackendClient::proxy($method, $path, $payload, 20);
    }

    private static function backendProxyRaw(string $method, string $path, array $payload)
    {
        return BackendClient::request($method, $path, $payload, 20);
    }
}
