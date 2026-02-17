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
            'permission_callback' => function ($request) {
                if (!current_user_can('manage_options')) {
                    return new \WP_Error('rest_forbidden', 'Insufficient permissions', ['status' => 403]);
                }

                return Nonces::verifyRestNonceOrError($request);
            },
            'callback' => [self::class, 'status'],
        ]);
    }

    public static function status(\WP_REST_Request $request)
    {
        $identity = Options::ensureInstallationIdentity();

        $pairedAt = Options::get(Constants::OPTION_PAIRED_AT);
        $backendBaseUrl = Options::backendBaseUrl();
        if ($backendBaseUrl === '') {
            $backendBaseUrl = Constants::backendBaseUrl();
        }

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'installation_id' => $identity['installation_id'],
                'paired' => $pairedAt !== '' && Options::backendPublicKey() !== '',
                'paired_at' => $pairedAt,
                'backend_base_url' => $backendBaseUrl,
                'backend_audience' => Options::backendAudience() !== '' ? Options::backendAudience() : Constants::backendAudience(),
                'signature_alg' => $identity['signature_alg'],
            ],
            'error' => null,
            'meta' => null,
        ]);
    }
}
