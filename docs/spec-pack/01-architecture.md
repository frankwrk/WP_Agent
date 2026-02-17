# Architecture Notes (M2)

## Admin UI

React pages implemented in:

- `apps/wp-plugin/admin/src/pages/Connect.tsx`
- `apps/wp-plugin/admin/src/pages/Chat.tsx`

WordPress registers menu pages and enqueues the Vite bundle from:

- `apps/wp-plugin/includes/admin/ui.php`

## Request Flow

1. Browser (WP admin) calls `wp-agent-admin/v1/*` using WP nonce.
2. WP admin REST proxy validates capability + nonce.
3. WP server calls backend `/api/v1/sessions*` with `X-WP-Agent-Bootstrap`.
4. Backend validates policy + installation + scope.
5. Backend loads WP tool context once (session create), then reuses snapshot for chat.

## Runtime Rules

- No direct browser-to-LLM calls.
- No direct browser-to-backend calls.
- Tool context is provided by signed backend->WP calls.
- Chat is read-only in M2.

## Shared Contracts

`packages/shared/src` defines shared interfaces for:

- policy presets
- tool manifest/tool definitions
- plan/skill placeholders

These shared types are used as canonical contract definitions for later milestones.
