Backend Implementation

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
