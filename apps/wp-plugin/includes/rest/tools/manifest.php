<?php

namespace WP_Agent_Runtime\Rest\Tools;

if (!defined('ABSPATH')) exit;

class Manifest
{
    public static function handle($request)
    {
        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'tools' => [],
            ],
            'error' => null,
            'meta' => [
                'version' => '0.1.0',
                'milestone' => 'M0',
            ],
        ]);
    }
}
