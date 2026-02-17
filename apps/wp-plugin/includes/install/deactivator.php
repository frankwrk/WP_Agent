<?php

namespace WP_Agent_Runtime\Install;

if (!defined('ABSPATH')) exit;

class Deactivator
{
    public static function deactivate(): void
    {
        // Intentionally keep runtime state to preserve pairing between restarts.
    }
}
