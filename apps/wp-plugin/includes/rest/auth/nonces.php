<?php

namespace WP_Agent_Runtime\Rest\Auth;

if (!defined('ABSPATH')) exit;

class Nonces
{
    public static function verifyRestNonceOrError(\WP_REST_Request $request)
    {
        $nonce = trim((string) $request->get_header('x-wp-nonce'));
        if ($nonce === '') {
            $nonce = trim((string) $request->get_param('_wpnonce'));
        }

        if ($nonce === '' || !wp_verify_nonce($nonce, 'wp_rest')) {
            return new \WP_Error(
                'wp_agent_admin_nonce_invalid',
                'Invalid or missing REST nonce',
                ['status' => 403]
            );
        }

        return true;
    }
}
