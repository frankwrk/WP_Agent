<?php

/**
 * Plugin Name: WP Agent Runtime
 * Description: Adds an agent runtime + skill execution layer to WordPress (Tool API + Admin UI).
 * Version: 0.1.0
 * Author: SYNQ Group
 */

if (!defined('ABSPATH')) exit;

require_once __DIR__ . '/includes/bootstrap.php';

register_activation_hook(__FILE__, ['WP_Agent_Runtime\\Install\\Activator', 'activate']);
register_deactivation_hook(__FILE__, ['WP_Agent_Runtime\\Install\\Deactivator', 'deactivate']);
