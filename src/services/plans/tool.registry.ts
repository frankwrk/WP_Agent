import type { SkillSafetyClass } from "../skills/normalize";

export interface ToolRegistryEntry {
  name: string;
  description: string;
  safetyClass: SkillSafetyClass;
  costWeight: number;
  readOnly: boolean;
  schemaHints?: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
}

const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  "site.get_environment": {
    name: "site.get_environment",
    description: "Read WordPress runtime environment metadata",
    safetyClass: "read",
    costWeight: 1,
    readOnly: true,
  },
  "content.inventory": {
    name: "content.inventory",
    description: "Read content inventory and sampled items",
    safetyClass: "read",
    costWeight: 2,
    readOnly: true,
  },
  "seo.get_config": {
    name: "seo.get_config",
    description: "Read normalized SEO configuration",
    safetyClass: "read",
    costWeight: 1,
    readOnly: true,
  },
  "content.create_page": {
    name: "content.create_page",
    description: "Create a single WordPress page draft",
    safetyClass: "write_draft",
    costWeight: 4,
    readOnly: false,
  },
  "content.bulk_create": {
    name: "content.bulk_create",
    description: "Create multiple WordPress page drafts",
    safetyClass: "write_publish",
    costWeight: 7,
    readOnly: false,
  },
};

export class ToolRegistryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

export function getToolRegistry(): Record<string, ToolRegistryEntry> {
  return { ...TOOL_REGISTRY };
}

export function getToolRegistryEntry(toolName: string): ToolRegistryEntry | null {
  return TOOL_REGISTRY[toolName] ?? null;
}

export function assertKnownToolNames(toolNames: string[]): void {
  for (const toolName of toolNames) {
    if (!TOOL_REGISTRY[toolName]) {
      throw new ToolRegistryError("SKILL_UNKNOWN_TOOL", `Unknown tool referenced: ${toolName}`);
    }
  }
}

export function assertManifestAvailability(toolNames: string[], manifestToolNames: Set<string>): void {
  for (const toolName of toolNames) {
    if (!manifestToolNames.has(toolName)) {
      throw new ToolRegistryError(
        "PLAN_INVALID_TOOL",
        `Tool is not available in this installation manifest: ${toolName}`,
      );
    }
  }
}
