<?php

namespace WP_Agent_Runtime\Utils;

if (!defined('ABSPATH')) exit;

class Crypto
{
    public static function generateEd25519Keypair(): array
    {
        if (!function_exists('sodium_crypto_sign_keypair')) {
            throw new \RuntimeException('libsodium is required for Ed25519 support');
        }

        $keypair = sodium_crypto_sign_keypair();
        $public = sodium_crypto_sign_publickey($keypair);
        $secret = sodium_crypto_sign_secretkey($keypair);

        return [
            'public_key' => base64_encode($public),
            'private_key' => base64_encode($secret),
        ];
    }

    public static function encryptPrivateKey(string $privateKeyBase64): string
    {
        $key = self::deriveEncryptionKey();
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = sodium_crypto_secretbox($privateKeyBase64, $nonce, $key);

        return base64_encode($nonce . $ciphertext);
    }

    public static function decryptPrivateKey(string $encrypted): string
    {
        $decoded = base64_decode($encrypted, true);
        if ($decoded === false || strlen($decoded) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            throw new \RuntimeException('Encrypted private key payload is invalid');
        }

        $nonce = substr($decoded, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = substr($decoded, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);

        $decrypted = sodium_crypto_secretbox_open($ciphertext, $nonce, self::deriveEncryptionKey());
        if ($decrypted === false) {
            throw new \RuntimeException('Unable to decrypt private key');
        }

        return $decrypted;
    }

    public static function verifyEd25519(string $message, string $signatureBase64, string $publicKeyBase64): bool
    {
        $signature = base64_decode($signatureBase64, true);
        $publicKey = base64_decode($publicKeyBase64, true);

        if ($signature === false || $publicKey === false) {
            return false;
        }

        if (strlen($signature) !== SODIUM_CRYPTO_SIGN_BYTES || strlen($publicKey) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
            return false;
        }

        return sodium_crypto_sign_verify_detached($signature, $message, $publicKey);
    }

    private static function deriveEncryptionKey(): string
    {
        $saltMaterial = '';

        if (function_exists('wp_salt')) {
            $saltMaterial = wp_salt('auth') . '|' . wp_salt('secure_auth');
        }

        if ($saltMaterial === '') {
            $authKey = defined('AUTH_KEY') ? AUTH_KEY : '';
            $secureAuthKey = defined('SECURE_AUTH_KEY') ? SECURE_AUTH_KEY : '';
            $saltMaterial = $authKey . '|' . $secureAuthKey;
        }

        return hash('sha256', $saltMaterial, true);
    }
}
