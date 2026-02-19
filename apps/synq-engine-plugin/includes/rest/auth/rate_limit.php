<?php

namespace WP_Agent_Runtime\Rest\Auth;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Storage\Tables;

if (!defined('ABSPATH')) exit;

class Rate_Limit
{
    public static function enforceOrError(string $installationId)
    {
        $result = Tables::checkAndIncrementRateLimit(
            $installationId,
            Constants::rateLimitRequestsPerWindow(),
            Constants::rateLimitWindowSeconds()
        );

        if ($result['allowed']) {
            return true;
        }

        return new \WP_Error(
            'wp_agent_rate_limited',
            'Rate limit exceeded',
            [
                'status' => 429,
                'code' => 'RATE_LIMIT_EXCEEDED',
                'retry_after' => $result['retry_after'],
            ]
        );
    }
}
