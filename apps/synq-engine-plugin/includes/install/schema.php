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
        $jobsTable = $wpdb->prefix . 'wp_agent_jobs';
        $auditLogTable = $wpdb->prefix . 'wp_agent_audit_log';
        $rollbackTable = $wpdb->prefix . 'wp_agent_rollback_handles';

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

        $jobsSql = "
            CREATE TABLE {$jobsTable} (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                job_id CHAR(36) NOT NULL,
                run_id CHAR(36) NOT NULL,
                step_id VARCHAR(191) NOT NULL,
                status VARCHAR(32) NOT NULL,
                scheduler VARCHAR(32) NOT NULL,
                total_items INT UNSIGNED NOT NULL DEFAULT 0,
                processed_items INT UNSIGNED NOT NULL DEFAULT 0,
                created_items INT UNSIGNED NOT NULL DEFAULT 0,
                failed_items INT UNSIGNED NOT NULL DEFAULT 0,
                payload LONGTEXT NULL,
                result LONGTEXT NULL,
                error TEXT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                started_at DATETIME NULL,
                finished_at DATETIME NULL,
                PRIMARY KEY (id),
                UNIQUE KEY job_id_unq (job_id),
                KEY run_id_idx (run_id),
                KEY status_idx (status),
                KEY created_idx (created_at)
            ) {$charsetCollate};
        ";

        $auditSql = "
            CREATE TABLE {$auditLogTable} (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                event_id CHAR(36) NOT NULL,
                run_id CHAR(36) NOT NULL,
                step_id VARCHAR(191) NOT NULL,
                tool_name VARCHAR(191) NOT NULL,
                action VARCHAR(64) NOT NULL,
                actor VARCHAR(64) NOT NULL,
                tool_call_id CHAR(36) NULL,
                request_payload LONGTEXT NULL,
                response_payload LONGTEXT NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY event_id_unq (event_id),
                KEY run_step_idx (run_id, step_id),
                KEY tool_idx (tool_name),
                KEY created_idx (created_at)
            ) {$charsetCollate};
        ";

        $rollbackSql = "
            CREATE TABLE {$rollbackTable} (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                handle_id CHAR(36) NOT NULL,
                run_id CHAR(36) NOT NULL,
                step_id VARCHAR(191) NOT NULL,
                kind VARCHAR(64) NOT NULL,
                target_post_id BIGINT UNSIGNED NULL,
                revision_id BIGINT UNSIGNED NULL,
                payload LONGTEXT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                error TEXT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                applied_at DATETIME NULL,
                PRIMARY KEY (id),
                UNIQUE KEY handle_id_unq (handle_id),
                KEY run_id_idx (run_id),
                KEY status_idx (status)
            ) {$charsetCollate};
        ";

        dbDelta($idempotencySql);
        dbDelta($rateLimitSql);
        dbDelta($jobsSql);
        dbDelta($auditSql);
        dbDelta($rollbackSql);
    }
}
