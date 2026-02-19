<?php

namespace WP_Agent_Runtime\Install;

use WP_Agent_Runtime\Storage\Options;

if (!defined('ABSPATH')) exit;

class Activator
{
    public static function activate(): void
    {
        Schema::createTables();
        Options::ensureInstallationIdentity();
    }
}
