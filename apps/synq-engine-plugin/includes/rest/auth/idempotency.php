<?php

namespace WP_Agent_Runtime\Rest\Auth;

use WP_Agent_Runtime\Constants;
use WP_Agent_Runtime\Storage\Tables;

if (!defined('ABSPATH')) exit;

class Idempotency
{
    public static function claimOrError(string $installationId, string $toolCallId)
    {
        $claimed = Tables::claimIdempotency(
            $installationId,
            $toolCallId,
            Constants::IDEMPOTENCY_WINDOW_HOURS
        );

        if ($claimed) {
            return true;
        }

        return new \WP_Error(
            'wp_agent_idempotency_replay',
            'Duplicate tool_call_id for installation',
            [
                'status' => 409,
                'code' => 'IDEMPOTENCY_REPLAY',
            ]
        );
    }
}
