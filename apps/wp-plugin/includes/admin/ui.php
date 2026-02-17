<?php

namespace WP_Agent_Runtime\Admin;

use WP_Agent_Runtime\Constants;

if (!defined('ABSPATH')) exit;

class UI
{
    private const MENU_CONNECT_SLUG = 'wp-agent-runtime-connect';
    private const MENU_CHAT_SLUG = 'wp-agent-runtime-chat';

    public static function registerHooks(): void
    {
        add_action('admin_menu', [self::class, 'registerMenu']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueueAssets']);
    }

    public static function registerMenu(): void
    {
        add_menu_page(
            'WP Agent Runtime',
            'WP Agent',
            'manage_options',
            self::MENU_CONNECT_SLUG,
            [self::class, 'renderConnectPage'],
            'dashicons-admin-site-alt3',
            58
        );

        add_submenu_page(
            self::MENU_CONNECT_SLUG,
            'Connect',
            'Connect',
            'manage_options',
            self::MENU_CONNECT_SLUG,
            [self::class, 'renderConnectPage']
        );

        add_submenu_page(
            self::MENU_CONNECT_SLUG,
            'Chat',
            'Chat',
            'manage_options',
            self::MENU_CHAT_SLUG,
            [self::class, 'renderChatPage']
        );
    }

    public static function enqueueAssets(string $hookSuffix): void
    {
        $allowedHooks = [
            'toplevel_page_' . self::MENU_CONNECT_SLUG,
            'wp-agent_page_' . self::MENU_CHAT_SLUG,
        ];

        if (!in_array($hookSuffix, $allowedHooks, true)) {
            return;
        }

        $pluginFile = dirname(__DIR__, 2) . '/plugin.php';
        $pluginRoot = dirname($pluginFile);
        $scriptFile = $pluginRoot . '/admin/dist/wp-agent-admin.js';
        $styleFile = $pluginRoot . '/admin/dist/wp-agent-admin.css';

        if (!file_exists($scriptFile)) {
            return;
        }

        $scriptUrl = plugins_url('admin/dist/wp-agent-admin.js', $pluginFile);
        $styleUrl = plugins_url('admin/dist/wp-agent-admin.css', $pluginFile);

        wp_enqueue_script('wp-agent-admin-app', $scriptUrl, [], Constants::PLUGIN_VERSION, true);
        wp_script_add_data('wp-agent-admin-app', 'type', 'module');

        if (file_exists($styleFile)) {
            wp_enqueue_style('wp-agent-admin-app', $styleUrl, [], Constants::PLUGIN_VERSION);
        }

        wp_localize_script('wp-agent-admin-app', 'WP_AGENT_ADMIN_CONFIG', [
            'restBase' => esc_url_raw(rest_url('wp-agent-admin/v1')),
            'nonce' => wp_create_nonce('wp_rest'),
            'initialPage' => self::currentPage(),
            'siteUrl' => get_site_url(),
        ]);
    }

    public static function renderConnectPage(): void
    {
        self::renderShell('connect');
    }

    public static function renderChatPage(): void
    {
        self::renderShell('chat');
    }

    private static function renderShell(string $page): void
    {
        echo '<div class="wrap">';
        echo '<div id="wp-agent-admin-root" data-initial-page="' . esc_attr($page) . '"></div>';
        echo '</div>';
    }

    private static function currentPage(): string
    {
        $page = isset($_GET['page']) ? sanitize_key((string) $_GET['page']) : self::MENU_CONNECT_SLUG;
        if ($page === self::MENU_CHAT_SLUG) {
            return 'chat';
        }

        return 'connect';
    }
}
