<?php

namespace WP_Agent_Runtime\Adapters\SEO;

if (!defined('ABSPATH')) exit;

class None_Adapter
{
    public static function getConfig(): array
    {
        return [
            'provider' => 'none',
            'enabled' => false,
            'xml_sitemaps_enabled' => false,
            'breadcrumbs_enabled' => false,
            'open_graph_enabled' => false,
            'notes' => 'No supported SEO plugin detected',
        ];
    }
}
