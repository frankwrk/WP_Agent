export type SkillSafetyClass = "read" | "write_draft" | "write_publish";

export interface SkillSourceV1 {
  repo: string;
  commit_sha: string;
  path: string;
}

export interface SkillCapsV1 {
  max_pages?: number;
  max_tool_calls?: number;
  max_steps?: number;
  max_cost_usd?: number;
}

export interface SkillSpecV1 {
  skill_id: string;
  version: string;
  source: SkillSourceV1;
  name: string;
  description: string;
  tags: string[];
  inputs_schema: Record<string, unknown>;
  outputs_schema: Record<string, unknown>;
  tool_allowlist: string[];
  caps: SkillCapsV1;
  safety_class: SkillSafetyClass;
  deprecated?: boolean;
}

export interface SkillCatalogItemV1 {
  skill_id: string;
  version: string;
  name: string;
  description: string;
  tags: string[];
  safety_class: SkillSafetyClass;
  deprecated: boolean;
  source_repo: string;
  source_commit_sha: string;
  updated_at: string;
}
