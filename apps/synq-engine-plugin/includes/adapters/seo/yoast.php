<?php

namespace WP_Agent_Runtime\Adapters\SEO;

if (!defined('ABSPATH')) exit;

class Yoast_Adapter
{
    public static function isActive(): bool
    {
        return defined('WPSEO_VERSION') || class_exists('WPSEO_Options');
    }

    public static function getConfig(): array
    {
        $titles = get_option('wpseo_titles', []);
        if (!is_array($titles)) {
            $titles = [];
        }

        return [
            'provider' => 'yoast',
            'enabled' => true,
            'version' => defined('WPSEO_VERSION') ? (string) WPSEO_VERSION : '',
            'xml_sitemaps_enabled' => self::asBool($titles['enable_xml_sitemap'] ?? true),
            'breadcrumbs_enabled' => self::asBool($titles['breadcrumbs-enable'] ?? false),
            'open_graph_enabled' => self::asBool($titles['opengraph'] ?? true),
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
