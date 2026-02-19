<?php

namespace WP_Agent_Runtime\Rest\Admin;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class BackendClient
{
    public static function proxy(string $method, string $path, array $payload, int $timeout = 30)
    {
        $result = self::request($method, $path, $payload, $timeout);
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    public static function request(string $method, string $path, array $payload, int $timeout = 30)
    {
        $bootstrapSecret = Constants::pairingBootstrapSecret();
        if ($bootstrapSecret === '') {
            return new \WP_Error(
                'wp_agent_bootstrap_secret_missing',
                'PAIRING_BOOTSTRAP_SECRET is not configured',
                ['status' => 500]
            );
        }

        $url = Options::buildBackendUrl($path);
        if ($url === '') {
            return new \WP_Error(
                'wp_agent_backend_url_missing',
                'Backend URL is not configured',
                ['status' => 500]
            );
        }

        $args = [
            'method' => $method,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-WP-Agent-Bootstrap' => $bootstrapSecret,
            ],
            'timeout' => $timeout,
        ];

        if (strtoupper($method) === 'GET') {
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
