Backend Implementation

apps/backend/src/services/plans/
plan.contract.ts
plan.parse.ts
plan.validate.ts
estimate.ts

Shared Types

packages/shared/src/types/plan.ts
packages/shared/src/schemas/plan.schema.json

Tests
apps/backend/test/unit/plan.validate.test.ts

### **Enforcement Points**

- Validate:
  - Tool exists in manifest
  - Tool is allowed in skill allowlist
  - Step count ≤ policy caps
  - Page count ≤ skill caps
- Reject invalid plans before execution
