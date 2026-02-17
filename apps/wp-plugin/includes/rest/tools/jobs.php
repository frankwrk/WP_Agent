<?php

namespace WP_Agent_Runtime\Rest\Tools;

use WP_Agent_Runtime\Storage\Job_Store;

if (!defined('ABSPATH')) exit;

class Jobs
{
    public static function getStatus(\WP_REST_Request $request)
    {
        $jobId = trim((string) $request->get_param('job_id'));
        if ($jobId === '') {
            return new \WP_Error('wp_agent_job_id_missing', 'job_id is required', ['status' => 400]);
        }

        $job = Job_Store::get($jobId);
        if (!$job) {
            return new \WP_Error('wp_agent_job_not_found', 'Job not found', ['status' => 404]);
        }

        $result = is_array($job['result'] ?? null) ? $job['result'] : [];

        return rest_ensure_response([
            'ok' => true,
            'data' => [
                'job_id' => $job['job_id'],
                'run_id' => $job['run_id'],
                'step_id' => $job['step_id'],
                'status' => $job['status'],
                'progress' => [
                    'total_items' => intval($job['total_items'], 10),
                    'processed_items' => intval($job['processed_items'], 10),
                    'created_items' => intval($job['created_items'], 10),
                    'failed_items' => intval($job['failed_items'], 10),
                ],
                'rollback_handles' => is_array($result['rollback_handles'] ?? null) ? $result['rollback_handles'] : [],
                'errors' => is_array($result['errors'] ?? null) ? $result['errors'] : [],
                'updated_at' => $job['updated_at'],
                'started_at' => $job['started_at'],
                'finished_at' => $job['finished_at'],
            ],
            'error' => null,
            'meta' => [
                'tool' => 'jobs.get_status',
            ],
        ]);
    }
}
