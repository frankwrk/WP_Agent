<?php

namespace WP_Agent_Runtime\Storage;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Utils\Crypto;

if (!defined('ABSPATH')) exit;

class Options
{
    public static function get(string $key, string $default = ''): string
    {
        $value = get_option($key, $default);
        return is_string($value) ? $value : $default;
    }

    public static function set(string $key, string $value): void
    {
        update_option($key, $value, false);
    }

    public static function ensureInstallationIdentity(): array
    {
        $installationId = self::get(Constants::OPTION_INSTALLATION_ID);
        $publicKey = self::get(Constants::OPTION_PUBLIC_KEY);
        $encryptedPrivateKey = self::get(Constants::OPTION_PRIVATE_KEY_ENCRYPTED);

        if ($installationId === '') {
            $installationId = wp_generate_uuid4();
            self::set(Constants::OPTION_INSTALLATION_ID, $installationId);
        }

        if ($publicKey === '' || $encryptedPrivateKey === '') {
            $generated = Crypto::generateEd25519Keypair();

            $publicKey = $generated['public_key'];
            $encryptedPrivateKey = Crypto::encryptPrivateKey($generated['private_key']);

            self::set(Constants::OPTION_PUBLIC_KEY, $publicKey);
            self::set(Constants::OPTION_PRIVATE_KEY_ENCRYPTED, $encryptedPrivateKey);
            self::set(Constants::OPTION_SIGNATURE_ALG, Constants::SIGNATURE_ALG);
        }

        return [
            'installation_id' => $installationId,
            'public_key' => $publicKey,
            'signature_alg' => self::get(Constants::OPTION_SIGNATURE_ALG, Constants::SIGNATURE_ALG),
        ];
    }

    public static function setPairingResult(
        string $backendPublicKey,
        string $backendBaseUrl,
        string $backendAudience,
        string $pairedAtIso
    ): void
    {
        self::set(Constants::OPTION_BACKEND_PUBLIC_KEY, $backendPublicKey);
        $sanitizedBackendUrl = self::sanitizeBackendBaseUrl($backendBaseUrl);
        if ($sanitizedBackendUrl !== '') {
            self::set(Constants::OPTION_BACKEND_BASE_URL, $sanitizedBackendUrl);
        }
        self::set(Constants::OPTION_BACKEND_AUDIENCE, $backendAudience);
        self::set(Constants::OPTION_PAIRED_AT, $pairedAtIso);
    }

    public static function installationId(): string
    {
        return self::get(Constants::OPTION_INSTALLATION_ID);
    }

    public static function backendPublicKey(): string
    {
        return self::get(Constants::OPTION_BACKEND_PUBLIC_KEY);
    }

    public static function backendBaseUrl(): string
    {
        $stored = self::sanitizeBackendBaseUrl(self::get(Constants::OPTION_BACKEND_BASE_URL));
        if ($stored !== '') {
            return $stored;
        }

        $fallback = '';
        if (defined('SYNQ_BACKEND_URL')) {
            $fallback = (string) constant('SYNQ_BACKEND_URL');
        }

        if ($fallback === '') {
            $fallback = Constants::backendBaseUrl();
        }

        $fallback = self::sanitizeBackendBaseUrl($fallback);
        if ($fallback === '') {
            $fallback = Constants::DEFAULT_BACKEND_BASE_URL;
        }

        $filtered = apply_filters('synq_backend_url', $fallback);
        $filteredString = is_string($filtered) ? $filtered : $fallback;
        $sanitizedFiltered = self::sanitizeBackendBaseUrl($filteredString);
        if ($sanitizedFiltered !== '') {
            return $sanitizedFiltered;
        }

        return $fallback;
    }

    public static function setBackendBaseUrl(string $url): bool
    {
        $sanitized = self::sanitizeBackendBaseUrl($url);
        if ($sanitized === '') {
            return false;
        }

        self::set(Constants::OPTION_BACKEND_BASE_URL, $sanitized);
        return true;
    }

    public static function buildBackendUrl(string $path): string
    {
        $baseUrl = self::backendBaseUrl();
        if ($baseUrl === '') {
            return '';
        }

        return rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
    }

    public static function sanitizeBackendBaseUrl(string $url): string
    {
        $candidate = trim($url);
        if ($candidate === '') {
            return '';
        }

        $candidate = rtrim($candidate, '/');
        $parts = wp_parse_url($candidate);
        if (!is_array($parts)) {
            return '';
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (($scheme !== 'http' && $scheme !== 'https') || $host === '') {
            return '';
        }

        if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return '';
        }

        $port = isset($parts['port']) ? intval($parts['port'], 10) : null;
        if ($port !== null && ($port < 1 || $port > 65535)) {
            return '';
        }

        $path = isset($parts['path']) ? trim((string) $parts['path']) : '';
        if ($path !== '') {
            $path = '/' . ltrim($path, '/');
            $path = rtrim($path, '/');
        }

        $normalized = $scheme . '://' . $host;
        if ($port !== null) {
            $normalized .= ':' . $port;
        }
        if ($path !== '') {
            $normalized .= $path;
        }

        return $normalized;
    }

    public static function backendAudience(): string
    {
        return self::get(Constants::OPTION_BACKEND_AUDIENCE);
    }
}
