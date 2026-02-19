<?php

namespace WP_Agent_Runtime\Rest\Auth;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Storage\Options;
use WP_Agent_Runtime\Utils\Canonical_JSON;
use WP_Agent_Runtime\Utils\Crypto;

if (!defined('ABSPATH')) exit;

class Signatures
{
    public static function authorizeSignedRequest(\WP_REST_Request $request)
    {
        $installationId = trim((string) $request->get_header('x-wp-agent-installation'));
        $timestampRaw = trim((string) $request->get_header('x-wp-agent-timestamp'));
        $ttlRaw = trim((string) $request->get_header('x-wp-agent-ttl'));
        $toolCallId = trim((string) $request->get_header('x-wp-agent-toolcallid'));
        $audience = trim((string) $request->get_header('x-wp-agent-audience'));
        $signature = trim((string) $request->get_header('x-wp-agent-signature'));
        $signatureAlg = strtolower(trim((string) $request->get_header('x-wp-agent-signaturealg')));

        if (
            $installationId === '' ||
            $timestampRaw === '' ||
            $ttlRaw === '' ||
            $toolCallId === '' ||
            $audience === '' ||
            $signature === '' ||
            $signatureAlg === ''
        ) {
            return self::authError('SIGNATURE_HEADERS_MISSING', 'Required signature headers are missing');
        }

        if ($signatureAlg !== Constants::SIGNATURE_ALG) {
            return self::authError('SIGNATURE_ALG_INVALID', 'Unsupported signature algorithm');
        }

        $storedInstallationId = Options::installationId();
        if ($storedInstallationId === '' || !hash_equals($storedInstallationId, $installationId)) {
            return self::authError('INSTALLATION_MISMATCH', 'Installation does not match local runtime');
        }

        $timestamp = intval($timestampRaw, 10);
        $ttl = intval($ttlRaw, 10);
        if ($timestamp <= 0 || $ttl <= 0) {
            return self::authError('SIGNATURE_TIME_INVALID', 'Timestamp and TTL must be positive integers');
        }

        $now = time();
        if ($timestamp > ($now + Constants::signatureMaxFutureSkewSeconds())) {
            return self::authError('SIGNATURE_CLOCK_SKEW', 'Timestamp is too far in the future');
        }

        if (($now - $timestamp) > $ttl) {
            return self::authError('SIGNATURE_EXPIRED', 'Signed request is expired');
        }

        $expectedAudience = Options::backendAudience();
        if ($expectedAudience === '') {
            $expectedAudience = Constants::backendAudience();
        }

        if (!hash_equals($expectedAudience, $audience)) {
            return self::authError('SIGNATURE_AUDIENCE_MISMATCH', 'Signed request audience is invalid');
        }

        $backendPublicKey = Options::backendPublicKey();
        if ($backendPublicKey === '') {
            return self::authError('BACKEND_KEY_MISSING', 'Backend public key is not configured');
        }

        $canonical = self::canonicalString($request, [
            'installation_id' => $installationId,
            'tool_call_id' => $toolCallId,
            'timestamp' => $timestamp,
            'ttl' => $ttl,
            'audience' => $audience,
        ]);

        if (!Crypto::verifyEd25519($canonical, $signature, $backendPublicKey)) {
            return self::authError('SIGNATURE_INVALID', 'Signature verification failed');
        }

        $rateResult = Rate_Limit::enforceOrError($installationId);
        if (is_wp_error($rateResult)) {
            return $rateResult;
        }

        $idempotencyResult = Idempotency::claimOrError($installationId, $toolCallId);
        if (is_wp_error($idempotencyResult)) {
            return $idempotencyResult;
        }

        return true;
    }

    private static function canonicalString(\WP_REST_Request $request, array $headers): string
    {
        $method = strtoupper($request->get_method());
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');

        $path = parse_url($requestUri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            $path = '/';
        }

        $queryRaw = parse_url($requestUri, PHP_URL_QUERY);
        $query = self::canonicalQuery(is_string($queryRaw) ? $queryRaw : '');

        $rawBody = $request->get_body();
        $canonicalBody = self::canonicalBodyFromRaw($rawBody);
        $bodyHash = hash('sha256', $canonicalBody);

        return implode("\n", [
            $headers['installation_id'],
            $headers['tool_call_id'],
            (string) $headers['timestamp'],
            (string) $headers['ttl'],
            $method,
            $host,
            (string) $headers['audience'],
            $path,
            $query,
            $bodyHash,
        ]);
    }

    private static function canonicalBodyFromRaw(string $rawBody): string
    {
        $trimmed = trim($rawBody);
        if ($trimmed === '') {
            return Canonical_JSON::encode((object) []);
        }

        $decoded = json_decode($rawBody);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return Canonical_JSON::encode(['_raw' => $rawBody]);
        }

        return Canonical_JSON::encode($decoded);
    }

    private static function canonicalQuery(string $query): string
    {
        if ($query === '') {
            return '';
        }

        $pairs = [];
        foreach (explode('&', $query) as $segment) {
            if ($segment === '') {
                continue;
            }

            $parts = explode('=', $segment, 2);
            $key = rawurldecode(str_replace('+', '%20', $parts[0]));
            $value = isset($parts[1]) ? rawurldecode(str_replace('+', '%20', $parts[1])) : '';
            $pairs[] = [$key, $value];
        }

        usort($pairs, function ($a, $b) {
            if ($a[0] === $b[0]) {
                return strcmp($a[1], $b[1]);
            }

            return strcmp($a[0], $b[0]);
        });

        $encoded = [];
        foreach ($pairs as $pair) {
            $encoded[] = rawurlencode($pair[0]) . '=' . rawurlencode($pair[1]);
        }

        return implode('&', $encoded);
    }

    private static function authError(string $code, string $message): \WP_Error
    {
        return new \WP_Error(
            'wp_agent_signature_error',
            $message,
            [
                'status' => 401,
                'code' => $code,
            ]
        );
    }
}
