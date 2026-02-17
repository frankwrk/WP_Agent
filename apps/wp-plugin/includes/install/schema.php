<?php

namespace WP_Agent_Runtime\Install;

use WP_Agent_Runtime\Storage\Tables;

if (!defined('ABSPATH')) exit;

class Schema
{
    public static function createTables(): void
    {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charsetCollate = $wpdb->get_charset_collate();
        $idempotencyTable = Tables::idempotencyTable();
        $rateLimitTable = Tables::rateLimitTable();

        $idempotencySql = "
            CREATE TABLE {$idempotencyTable} (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                installation_id CHAR(36) NOT NULL,
                tool_call_id CHAR(36) NOT NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY installation_tool_call (installation_id, tool_call_id),
                KEY created_at_idx (created_at)
            ) {$charsetCollate};
        ";

        $rateLimitSql = "
            CREATE TABLE {$rateLimitTable} (
                installation_id CHAR(36) NOT NULL,
                bucket_start_epoch BIGINT UNSIGNED NOT NULL,
                request_count INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (installation_id, bucket_start_epoch),
                KEY updated_at_idx (updated_at)
            ) {$charsetCollate};
        ";

        dbDelta($idempotencySql);
        dbDelta($rateLimitSql);
    }
}
