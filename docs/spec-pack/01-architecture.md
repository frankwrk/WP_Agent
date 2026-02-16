Implementation

apps/wp-plugin/admin/src/pages/
Connect.tsx
Chat.tsx
Skills.tsx
RunDetail.tsx
Settings.tsx

### **Rules**

- No direct LLM calls from browser
- All execution via backend
- Plan preview required before execute

Shared Contracts

packages/shared/

Includes:

- Policy schema
- Plan schema
- Tool schema
- Skill schema

### **MUST**

Backend and WP must both depend on these shared definitions where possible.
