<?php

namespace WP_Agent_Runtime\Rest\Tools;

use WP_Agent_Runtime\Adapters\SEO\None_Adapter;
use WP_Agent_Runtime\Adapters\SEO\RankMath_Adapter;
use WP_Agent_Runtime\Adapters\SEO\Yoast_Adapter;

if (!defined('ABSPATH')) exit;

class SEO
{
    public static function getConfig(\WP_REST_Request $request)
    {
        if (Yoast_Adapter::isActive()) {
            $config = Yoast_Adapter::getConfig();
        } elseif (RankMath_Adapter::isActive()) {
            $config = RankMath_Adapter::getConfig();
        } else {
            $config = None_Adapter::getConfig();
        }

        return rest_ensure_response([
            'ok' => true,
            'data' => $config,
            'error' => null,
            'meta' => [
                'tool' => 'seo.get_config',
            ],
        ]);
    }
}
