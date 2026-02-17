<?php

namespace WP_Agent_Runtime\Storage;

if (!defined('ABSPATH')) exit;

class Audit_Log
{
    private static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'wp_agent_audit_log';
    }

    public static function log(array $event): void
    {
        global $wpdb;

        $eventId = isset($event['event_id']) && is_string($event['event_id']) && $event['event_id'] !== ''
            ? $event['event_id']
            : wp_generate_uuid4();

        $requestPayload = isset($event['request_payload'])
            ? wp_json_encode($event['request_payload'])
            : null;
        $responsePayload = isset($event['response_payload'])
            ? wp_json_encode($event['response_payload'])
            : null;

        $wpdb->insert(
            self::table(),
            [
                'event_id' => $eventId,
                'run_id' => (string) ($event['run_id'] ?? ''),
                'step_id' => (string) ($event['step_id'] ?? ''),
                'tool_name' => (string) ($event['tool_name'] ?? ''),
                'action' => (string) ($event['action'] ?? ''),
                'actor' => (string) ($event['actor'] ?? 'system'),
                'tool_call_id' => (string) ($event['tool_call_id'] ?? ''),
                'request_payload' => $requestPayload,
                'response_payload' => $responsePayload,
                'created_at' => gmdate('Y-m-d H:i:s'),
            ],
            [
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
                '%s',
            ]
        );
    }
}
