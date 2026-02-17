<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Rest\Auth\Nonces;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Skills
{
    public static function register(): void
    {
        register_rest_route('wp-agent-admin/v1', '/skills/sync', [
            'methods' => 'POST',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'sync'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/skills', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'listSkills'],
        ]);

        register_rest_route('wp-agent-admin/v1', '/skills/(?P<skill_id>[a-zA-Z0-9._:-]+)', [
            'methods' => 'GET',
            'permission_callback' => [self::class, 'permission'],
            'callback' => [self::class, 'getSkill'],
        ]);
    }

    public static function permission(\WP_REST_Request $request)
    {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
        }

        return Nonces::verifyRestNonceOrError($request);
    }

    public static function sync(\WP_REST_Request $request)
    {
        $repoUrl = trim((string) $request->get_param('repo_url'));
        $commitSha = trim((string) $request->get_param('commit_sha'));

        return self::backendProxy(
            'POST',
            '/api/v1/skills/sync',
            [
                'installation_id' => self::installationId(),
                'repo_url' => $repoUrl,
                'commit_sha' => $commitSha,
            ]
        );
    }

    public static function listSkills(\WP_REST_Request $request)
    {
        return self::backendProxy(
            'GET',
            '/api/v1/skills',
            [
                'installation_id' => self::installationId(),
                'tag' => trim((string) $request->get_param('tag')),
                'safety_class' => trim((string) $request->get_param('safety_class')),
                'deprecated' => $request->get_param('deprecated'),
                'search' => trim((string) $request->get_param('search')),
                'limit' => intval($request->get_param('limit') ?: 20, 10),
                'offset' => intval($request->get_param('offset') ?: 0, 10),
            ]
        );
    }

    public static function getSkill(\WP_REST_Request $request)
    {
        $skillId = trim((string) $request->get_param('skill_id'));
        if ($skillId === '') {
            return new \WP_Error(
                'wp_agent_skill_id_missing',
                'skill_id is required',
                ['status' => 400]
            );
        }

        return self::backendProxy(
            'GET',
            '/api/v1/skills/' . rawurlencode($skillId),
            [
                'installation_id' => self::installationId(),
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
