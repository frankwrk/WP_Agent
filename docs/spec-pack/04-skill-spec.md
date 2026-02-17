# Skill Spec v1 (M3)

## Purpose

M3 introduces a persisted skill registry per installation, sourced from a pinned repo commit.

## Canonical Shape

`SkillSpecV1` is normalized by backend ingest before storage.

Required fields:

- `skill_id`
- `version`
- `source{ repo, commit_sha, path }`
- `name`
- `description`
- `tags[]`
- `inputs_schema{}`
- `outputs_schema{}`
- `tool_allowlist[]`
- `caps{ max_pages?, max_tool_calls?, max_steps?, max_cost_usd? }`
- `safety_class` (`read | write_draft | write_publish`)
- `deprecated` (optional, default false)

## Ingestion Flow

Endpoint: `POST /api/v1/skills/sync`

Input:

- `installation_id`
- `repo_url`
- `commit_sha` (pin required)

Behavior:

- fetch pinned repo snapshot
- load `skills/**.json`
- normalize each spec to canonical v1
- validate tool allowlist against backend static tool registry
- persist provenance (`source_repo`, `source_commit_sha`, `source_path`) and ingestion record

Machine failures include:

- `SKILL_COMMIT_REQUIRED`
- `SKILL_SCHEMA_INVALID`
- `SKILL_UNKNOWN_TOOL`

## Query APIs

- `GET /api/v1/skills` (filters: `tag`, `safety_class`, `deprecated`, `search`, `limit`, `offset`)
- `GET /api/v1/skills/:skillId`

## Plan-Time Enforcement

During plan draft validation:

- tool must exist in static backend tool registry
- tool must be in skill allowlist
- tool must be available in installation WP manifest
- skill caps participate in plan gating
