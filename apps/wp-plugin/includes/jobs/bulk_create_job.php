<?php

namespace WP_Agent_Runtime\Jobs;

use WP_Agent_Runtime\Rest\Tools\Content;
use WP_Agent_Runtime\Storage\Audit_Log;
use WP_Agent_Runtime\Storage\Job_Store;

if (!defined('ABSPATH')) exit;

class Bulk_Create_Job
{
    public static function handleJob(string $jobId): void
    {
        $job = Job_Store::get($jobId);
        if (!$job) {
            return;
        }

        if ($job['status'] === 'completed' || $job['status'] === 'failed') {
            return;
        }

        Job_Store::markRunning($jobId);

        $runId = (string) ($job['run_id'] ?? '');
        $stepId = (string) ($job['step_id'] ?? '');
        $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $createdItems = [];
        $rollbackHandles = [];
        $errors = [];

        foreach ($items as $index => $item) {
            try {
                $result = Content::createDraftPageFromPayload($item, $runId, $stepId);
                $createdItems[] = $result['item'];
                $rollbackHandles[] = $result['rollback_handle'];
            } catch (\Throwable $error) {
                $errors[] = [
                    'index' => $index,
                    'message' => $error->getMessage(),
                ];
            }
        }

        $progress = [
            'processed_items' => count($items),
            'created_items' => count($createdItems),
            'failed_items' => count($errors),
        ];

        $resultPayload = [
            'run_id' => $runId,
            'step_id' => $stepId,
            'created_items' => $createdItems,
            'rollback_handles' => $rollbackHandles,
            'errors' => $errors,
        ];

        if (count($errors) > 0) {
            Job_Store::markFailed($jobId, $progress, 'One or more items failed during bulk create', $resultPayload);
            Audit_Log::log([
                'run_id' => $runId,
                'step_id' => $stepId,
                'tool_name' => 'content.bulk_create',
                'action' => 'job_failed',
                'actor' => 'system',
                'request_payload' => [
                    'job_id' => $jobId,
                    'item_count' => count($items),
                ],
                'response_payload' => $resultPayload,
            ]);
            return;
        }

        Job_Store::markCompleted($jobId, $progress, $resultPayload);
        Audit_Log::log([
            'run_id' => $runId,
            'step_id' => $stepId,
            'tool_name' => 'content.bulk_create',
            'action' => 'job_completed',
            'actor' => 'system',
            'request_payload' => [
                'job_id' => $jobId,
                'item_count' => count($items),
            ],
            'response_payload' => $resultPayload,
        ]);
    }
}
