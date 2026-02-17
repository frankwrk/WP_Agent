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
        self::set(Constants::OPTION_BACKEND_BASE_URL, $backendBaseUrl);
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
        return self::get(Constants::OPTION_BACKEND_BASE_URL);
    }

    public static function backendAudience(): string
    {
        return self::get(Constants::OPTION_BACKEND_AUDIENCE);
    }
}
