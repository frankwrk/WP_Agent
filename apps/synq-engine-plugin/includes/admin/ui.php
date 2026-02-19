<?php

namespace WP_Agent_Runtime\Admin;

use WP_Agent_Runtime\Constants;

if (!defined('ABSPATH')) exit;

class UI
{
    private const MENU_CONNECT_SLUG = 'wp-agent-runtime-connect';
    private const MENU_CHAT_SLUG = 'wp-agent-runtime-chat';
    private const MENU_SKILLS_SLUG = 'wp-agent-runtime-skills';

    public static function registerHooks(): void
    {
        add_action('admin_menu', [self::class, 'registerMenu']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueueAssets']);
    }

    public static function registerMenu(): void
    {
        add_menu_page(
            'SYNQ Engine',
            'SYNQ Engine',
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

        add_submenu_page(
            self::MENU_CONNECT_SLUG,
            'Skills',
            'Skills',
            'manage_options',
            self::MENU_SKILLS_SLUG,
            [self::class, 'renderSkillsPage']
        );
    }

    public static function enqueueAssets(string $hookSuffix): void
    {
        if (!self::isAllowedHook($hookSuffix)) {
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

    public static function renderSkillsPage(): void
    {
        self::renderShell('skills');
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

        if ($page === self::MENU_SKILLS_SLUG) {
            return 'skills';
        }

        return 'connect';
    }

    private static function isAllowedHook(string $hookSuffix): bool
    {
        if ($hookSuffix === 'toplevel_page_' . self::MENU_CONNECT_SLUG) {
            return true;
        }

        $chatSuffix = '_page_' . self::MENU_CHAT_SLUG;
        $skillsSuffix = '_page_' . self::MENU_SKILLS_SLUG;

        return self::endsWith($hookSuffix, $chatSuffix) || self::endsWith($hookSuffix, $skillsSuffix);
    }

    private static function endsWith(string $value, string $suffix): bool
    {
        $suffixLength = strlen($suffix);
        if ($suffixLength === 0) {
            return true;
        }

        return substr($value, -$suffixLength) === $suffix;
    }
}
