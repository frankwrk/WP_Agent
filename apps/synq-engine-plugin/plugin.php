<?php

/**
 * Plugin Name: SYNQ Engine
 * Description: SYNQ Engine runtime + skill execution layer for WordPress (Tool API + Admin UI).
 * Version: 0.1.2
 * Author: SYNQ Group
 */

if (!defined('ABSPATH')) exit;

require_once __DIR__ . '/includes/bootstrap.php';

register_activation_hook(__FILE__, ['WP_Agent_Runtime\\Install\\Activator', 'activate']);
register_deactivation_hook(__FILE__, ['WP_Agent_Runtime\\Install\\Deactivator', 'deactivate']);
