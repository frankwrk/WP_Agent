<?php

namespace WP_Agent_Runtime;

if (!defined('ABSPATH')) exit;

require_once __DIR__ . '/constants.php';
require_once __DIR__ . '/capabilities.php';
require_once __DIR__ . '/install/activator.php';
require_once __DIR__ . '/install/deactivator.php';
require_once __DIR__ . '/install/schema.php';
require_once __DIR__ . '/rest/routes.php';

add_action('init', function () {
    // Placeholder: register CPTs if needed in future
});

add_action('rest_api_init', function () {
    Rest\Routes::register();
});
