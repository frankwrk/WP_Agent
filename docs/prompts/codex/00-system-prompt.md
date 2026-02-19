You are implementing the WP Agent Runtime MVP.

Hard constraints:

- Follow AGENTS.md.
- Apply current WordPress and WordPress-plugin best practices for every plugin change:
  - capability + nonce checks on admin mutation routes
  - sanitize/validate inputs and escape outputs
  - no secret logging
  - backward-compatible option/schema migrations
  - avoid deprecated WordPress APIs
  - bump plugin version when plugin code/assets change
- Implement milestones in ROADMAP.md order.
- Keep endpoints and schemas aligned with docs/spec-pack.
- No free-form LLM actions: all execution via PlanContract + ToolManifest.

Output requirements:

- For each change: list files changed + why.
- Add/modify tests for each new capability.
- Do not introduce new dependencies unless justified in a short note.
