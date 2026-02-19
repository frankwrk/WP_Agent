<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Rest\Auth\Nonces;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Pair
{
    public static function register(): void
    {
        register_rest_route('wp-agent-admin/v1', '/pair', [
            'methods' => 'POST',
            'permission_callback' => function ($request) {
                if (!current_user_can('manage_options')) {
                    return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
                }

                return Nonces::verifyRestNonceOrError($request);
            },
            'callback' => [self::class, 'handle'],
        ]);
    }

    public static function handle(\WP_REST_Request $request)
    {
        $identity = Options::ensureInstallationIdentity();

        $bootstrapSecret = Constants::pairingBootstrapSecret();
        if ($bootstrapSecret === '') {
            return new \WP_Error(
                'wp_agent_pairing_secret_missing',
                'PAIRING_BOOTSTRAP_SECRET is not configured',
                ['status' => 500]
            );
        }

        $backendBaseUrl = Options::backendBaseUrl();
        if ($backendBaseUrl === '') {
            return new \WP_Error(
                'wp_agent_backend_url_missing',
                'Backend URL is not configured',
                ['status' => 500]
            );
        }

        $pairUrl = Options::buildBackendUrl('/api/v1/installations/pair');
        $response = wp_remote_post($pairUrl, [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-WP-Agent-Bootstrap' => $bootstrapSecret,
            ],
            'body' => wp_json_encode([
                'installation_id' => $identity['installation_id'],
                'site_url' => get_site_url(),
                'public_key' => $identity['public_key'],
                'signature_alg' => Constants::SIGNATURE_ALG,
                'plugin_version' => Constants::PLUGIN_VERSION,
            ]),
            'timeout' => 15,
        ]);

        if (is_wp_error($response)) {
            return new \WP_Error(
                'wp_agent_pairing_backend_unreachable',
                $response->get_error_message(),
                ['status' => 502]
            );
        }

        $statusCode = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);

        if ($statusCode < 200 || $statusCode >= 300 || !is_array($decoded) || empty($decoded['ok'])) {
            return new \WP_Error(
                'wp_agent_pairing_rejected',
                'Pairing request was rejected by backend',
                [
                    'status' => 502,
                    'backend_status' => $statusCode,
                    'backend_response' => $decoded,
                ]
            );
        }

        $backendPublicKey = (string) (($decoded['data']['backend_public_key'] ?? ''));
        if ($backendPublicKey === '') {
            return new \WP_Error(
                'wp_agent_pairing_missing_backend_key',
                'Backend did not return a public signing key',
                ['status' => 502]
            );
        }

        $backendAudience = (string) (($decoded['data']['backend_audience'] ?? Constants::backendAudience()));
        $backendBaseUrlToStore = $backendBaseUrl;
        $pairedAt = (string) (($decoded['data']['paired_at'] ?? gmdate('c')));
        Options::setPairingResult(
            $backendPublicKey,
            $backendBaseUrlToStore,
            $backendAudience,
            $pairedAt
        );

        $auditCode = (string) (($decoded['meta']['audit_code'] ?? ''));
        $message = 'Pairing completed';
        if ($auditCode === 'PAIRED_NO_CHANGE') {
            $message = 'Already paired; no changes';
        } elseif ($auditCode === 'KEY_ROTATED_UNVERIFIED') {
            $message = 'Pairing updated: key changed; review audit logs';
        }

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'installation_id' => $identity['installation_id'],
                'paired_at' => $pairedAt,
                'backend_status' => $statusCode,
                'backend_audience' => $backendAudience,
                'backend_base_url' => $backendBaseUrlToStore,
            ],
            'error' => null,
            'meta' => [
                'message' => $message,
                'audit_code' => $auditCode,
            ],
        ]);
    }
}
