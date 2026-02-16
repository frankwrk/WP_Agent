WordPress Implementation

apps/wp-plugin/includes/rest/tools/\*
manifest.php
site.php
content.php
seo.php
jobs.php
rollback.php

Security Enforcement

apps/wp-plugin/includes/rest/auth/
signatures.php
nonces.php
idempotency.php
rate_limit.php

Backend Tool Client
apps/backend/src/services/wp/
wp.client.ts
signature.ts
tool.manifest.ts

Tests

apps/backend/test/unit/
apps/backend/test/e2e/

### **MUST Rules**

- Every tool:
  - Capability check
  - Signed request validation
  - Idempotency check
  - Audit log entry
  - Rollback handle for write ops
- Tool must be declared in:
  - manifest.php
  - backend tool.manifest.ts
  - spec document
