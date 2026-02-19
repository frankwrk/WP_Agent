<?php

namespace WP_Agent_Runtime\Jobs;

use WP_Agent_Runtime\Storage\Job_Store;

if (!defined('ABSPATH')) exit;

class Scheduler
{
    public const BULK_CREATE_HOOK = 'wp_agent_runtime_bulk_create_job';

    public static function registerHooks(): void
    {
        add_action(self::BULK_CREATE_HOOK, [Bulk_Create_Job::class, 'handleJob'], 10, 1);
    }

    public static function enqueueBulkCreateJob(string $runId, string $stepId, array $items): array
    {
        $scheduler = self::supportsActionScheduler() ? 'action_scheduler' : 'wp_cron';

        $jobId = Job_Store::createQueued([
            'run_id' => $runId,
            'step_id' => $stepId,
            'scheduler' => $scheduler,
            'total_items' => count($items),
            'payload' => [
                'run_id' => $runId,
                'step_id' => $stepId,
                'items' => $items,
            ],
        ]);

        if (self::supportsActionScheduler()) {
            as_enqueue_async_action(self::BULK_CREATE_HOOK, [$jobId], 'wp-agent-runtime');
        } else {
            wp_schedule_single_event(time() + 1, self::BULK_CREATE_HOOK, [$jobId]);
        }

        return [
            'job_id' => $jobId,
            'status' => 'queued',
            'scheduler' => $scheduler,
        ];
    }

    private static function supportsActionScheduler(): bool
    {
        return function_exists('as_enqueue_async_action');
    }
}
