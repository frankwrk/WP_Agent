<?php

namespace WP_Agent_Runtime\Adapters\SEO;

if (!defined('ABSPATH')) exit;

class RankMath_Adapter
{
    public static function isActive(): bool
    {
        return defined('RANK_MATH_VERSION') || class_exists('RankMath');
    }

    public static function getConfig(): array
    {
        $general = get_option('rank_math_general', []);
        $sitemap = get_option('rank_math_options_sitemap', []);
        $titles = get_option('rank_math_titles', []);

        if (!is_array($general)) {
            $general = [];
        }

        if (!is_array($sitemap)) {
            $sitemap = [];
        }

        if (!is_array($titles)) {
            $titles = [];
        }

        return [
            'provider' => 'rankmath',
            'enabled' => true,
            'version' => defined('RANK_MATH_VERSION') ? (string) RANK_MATH_VERSION : '',
            'xml_sitemaps_enabled' => self::asBool($sitemap['sitemap'] ?? true),
            'breadcrumbs_enabled' => self::asBool($general['breadcrumbs'] ?? false),
            'open_graph_enabled' => self::asBool($titles['open_graph_image'] ?? true),
        ];
    }

    private static function asBool($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return intval($value, 10) === 1;
        }

        if (is_string($value)) {
            $normalized = strtolower(trim($value));
            return in_array($normalized, ['1', 'on', 'yes', 'true'], true);
        }

        return false;
    }
}
