export type SkillSafetyClass = "read" | "write_draft" | "write_publish";

export interface SkillSpec {
  skill_id: string;
  version: string;
  source: {
    repo: string;
    commit_sha: string;
    path: string;
  };
  name: string;
  description: string;
  tags: string[];
  inputs_schema: Record<string, unknown>;
  outputs_schema: Record<string, unknown>;
  tool_allowlist: string[];
  caps: {
    max_pages?: number;
    max_tool_calls?: number;
    max_steps?: number;
    max_cost_usd?: number;
  };
  safety_class: SkillSafetyClass;
  deprecated: boolean;
}
