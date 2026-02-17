## SkillSpec Canonical Schema v1

```
ts
type SkillSpecV1 = {
  skill_id: string
  version: string
  source: {
    repo: string
    commit_sha: string
    path: string
  }
  description: string
  tags: string[]
  inputs_schema: JSONSchema
  outputs_schema: JSONSchema
  tool_allowlist: string[]
  caps: {
    max_pages?: number
    max_tool_calls?: number
  }
  safety_class: "read" | "write_draft" | "write_publish"
  deprecated?: boolean
}
```

## Repo Ingestion & Provenance

Document:
	•	commit pinning required
	•	ingestion hash stored
	•	re-ingest requires new version
	•	no “floating HEAD” ingestion allowed

## Skill ↔ Tool Binding

State clearly:
	•	Every skill must declare allowed tools.
	•	If skill references unknown tool → ingestion fails.
	•	Plan validation enforces:
	•	tool exists
	•	tool in allowlist
	•	tool safety class compatible with policy


## Backend Implementation

apps/backend/src/services/skills/
ingest.github.ts
normalize.ts
store.ts

Skill Runtime Enforcement

apps/backend/src/services/policy/enforcement.ts

Shared Types

packages/shared/src/types/skill.ts

### **MUST**

- SkillSpec normalized before use
- Tool allowlist enforced
- Per-skill caps enforced

See:
- 02-tool-api.md (Tool Registry v1)
- 05-abuse-prevention.md (Estimation + caps)