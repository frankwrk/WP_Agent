"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistryError = void 0;
exports.getToolRegistry = getToolRegistry;
exports.getToolRegistryEntry = getToolRegistryEntry;
exports.assertKnownToolNames = assertKnownToolNames;
exports.assertManifestAvailability = assertManifestAvailability;
const TOOL_REGISTRY = {
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
        safetyClass: "write_draft",
        costWeight: 6,
        readOnly: false,
    },
};
class ToolRegistryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "ToolRegistryError";
    }
}
exports.ToolRegistryError = ToolRegistryError;
function getToolRegistry() {
    return { ...TOOL_REGISTRY };
}
function getToolRegistryEntry(toolName) {
    return TOOL_REGISTRY[toolName] ?? null;
}
function assertKnownToolNames(toolNames) {
    for (const toolName of toolNames) {
        if (!TOOL_REGISTRY[toolName]) {
            throw new ToolRegistryError("SKILL_UNKNOWN_TOOL", `Unknown tool referenced: ${toolName}`);
        }
    }
}
function assertManifestAvailability(toolNames, manifestToolNames) {
    for (const toolName of toolNames) {
        if (!manifestToolNames.has(toolName)) {
            throw new ToolRegistryError("PLAN_INVALID_TOOL", `Tool is not available in this installation manifest: ${toolName}`);
        }
    }
}
