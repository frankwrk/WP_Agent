<?php

namespace WP_Agent_Runtime;

if (!defined('ABSPATH')) exit;

require_once __DIR__ . '/constants.php';
require_once __DIR__ . '/capabilities.php';

require_once __DIR__ . '/utils/canonical_json.php';
require_once __DIR__ . '/utils/crypto.php';

require_once __DIR__ . '/adapters/seo/none.php';
require_once __DIR__ . '/adapters/seo/yoast.php';
require_once __DIR__ . '/adapters/seo/rankmath.php';

require_once __DIR__ . '/storage/options.php';
require_once __DIR__ . '/storage/tables.php';
require_once __DIR__ . '/storage/job_store.php';
require_once __DIR__ . '/storage/audit_log.php';
require_once __DIR__ . '/storage/rollback_store.php';

require_once __DIR__ . '/install/schema.php';
require_once __DIR__ . '/install/activator.php';
require_once __DIR__ . '/install/deactivator.php';

require_once __DIR__ . '/jobs/scheduler.php';
require_once __DIR__ . '/jobs/bulk_create_job.php';

require_once __DIR__ . '/admin/ui.php';

require_once __DIR__ . '/rest/auth/nonces.php';
require_once __DIR__ . '/rest/auth/idempotency.php';
require_once __DIR__ . '/rest/auth/rate_limit.php';
require_once __DIR__ . '/rest/auth/signatures.php';

require_once __DIR__ . '/rest/routes.php';

add_action('init', function () {
    Jobs\Scheduler::registerHooks();
});

add_action('plugins_loaded', function () {
    Admin\UI::registerHooks();
});

add_action('rest_api_init', function () {
    Rest\Routes::register();
});
