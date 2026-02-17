<?php

namespace WP_Agent_Runtime;

if (!defined('ABSPATH')) exit;

class Constants
{
    public const PLUGIN_VERSION = '0.1.0';

    public const OPTION_INSTALLATION_ID = 'wp_agent_installation_id';
    public const OPTION_PUBLIC_KEY = 'wp_agent_public_key';
    public const OPTION_PRIVATE_KEY_ENCRYPTED = 'wp_agent_private_key_encrypted';
    public const OPTION_BACKEND_PUBLIC_KEY = 'wp_agent_backend_public_key';
    public const OPTION_BACKEND_BASE_URL = 'wp_agent_backend_base_url';
    public const OPTION_BACKEND_AUDIENCE = 'wp_agent_backend_audience';
    public const OPTION_SIGNATURE_ALG = 'wp_agent_signature_alg';
    public const OPTION_PAIRED_AT = 'wp_agent_paired_at';

    public const SIGNATURE_ALG = 'ed25519';
    public const SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 300;
    public const SIGNATURE_TTL_SECONDS = 180;

    public const IDEMPOTENCY_WINDOW_HOURS = 24;

    public const RATE_LIMIT_WINDOW_SECONDS = 60;
    public const RATE_LIMIT_REQUESTS_PER_WINDOW = 60;
    public const BULK_CREATE_MAX_ITEMS = 50;

    public static function env(string $name, string $default = ''): string
    {
        $value = getenv($name);
        if ($value === false || $value === '') {
            return $default;
        }

        return (string) $value;
    }

    public static function intEnv(string $name, int $default): int
    {
        $value = self::env($name, '');
        if ($value === '') {
            return $default;
        }

        $parsed = intval($value, 10);
        return $parsed > 0 ? $parsed : $default;
    }

    public static function backendBaseUrl(): string
    {
        return rtrim(self::env('WP_AGENT_BACKEND_BASE_URL', 'http://localhost:3001'), '/');
    }

    public static function backendAudience(): string
    {
        return self::env('WP_AGENT_BACKEND_AUDIENCE', 'wp-agent-runtime');
    }

    public static function pairingBootstrapSecret(): string
    {
        return self::env('PAIRING_BOOTSTRAP_SECRET', '');
    }

    public static function signatureTtlSeconds(): int
    {
        return self::intEnv('SIGNATURE_TTL_SECONDS', self::SIGNATURE_TTL_SECONDS);
    }

    public static function signatureMaxFutureSkewSeconds(): int
    {
        return self::intEnv('SIGNATURE_MAX_SKEW_SECONDS', self::SIGNATURE_MAX_FUTURE_SKEW_SECONDS);
    }

    public static function rateLimitWindowSeconds(): int
    {
        return self::intEnv('WP_AGENT_RATE_LIMIT_WINDOW_SECONDS', self::RATE_LIMIT_WINDOW_SECONDS);
    }

    public static function rateLimitRequestsPerWindow(): int
    {
        return self::intEnv('WP_AGENT_RATE_LIMIT_REQUESTS_PER_WINDOW', self::RATE_LIMIT_REQUESTS_PER_WINDOW);
    }

    public static function bulkCreateMaxItems(): int
    {
        return self::intEnv('WP_AGENT_BULK_CREATE_MAX_ITEMS', self::BULK_CREATE_MAX_ITEMS);
    }
}
