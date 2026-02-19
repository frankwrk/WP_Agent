<?php

namespace WP_Agent_Runtime\Utils;

if (!defined('ABSPATH')) exit;

class Canonical_JSON
{
    public static function encode($value): string
    {
        $normalized = self::normalize($value);
        $json = wp_json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return $json === false ? '{}' : $json;
    }

    private static function normalize($value)
    {
        if (is_array($value)) {
            if (self::isSequentialArray($value)) {
                $normalized = [];
                foreach ($value as $item) {
                    $normalized[] = self::normalize($item);
                }
                return $normalized;
            }

            ksort($value, SORT_STRING);
            $normalized = [];
            foreach ($value as $key => $item) {
                $normalized[(string) $key] = self::normalize($item);
            }
            return $normalized;
        }

        if (is_object($value)) {
            $vars = get_object_vars($value);
            ksort($vars, SORT_STRING);
            $normalized = new \stdClass();
            foreach ($vars as $key => $item) {
                $normalized->{$key} = self::normalize($item);
            }
            return $normalized;
        }

        if (is_float($value)) {
            return (string) $value;
        }

        return $value;
    }

    private static function isSequentialArray(array $value): bool
    {
        if ($value === []) {
            return true;
        }

        return array_keys($value) === range(0, count($value) - 1);
    }
}
