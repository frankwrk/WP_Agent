"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillNormalizationError = void 0;
exports.normalizeSkillSpec = normalizeSkillSpec;
class SkillNormalizationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "SkillNormalizationError";
    }
}
exports.SkillNormalizationError = SkillNormalizationError;
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asString(value) {
    return String(value ?? "").trim();
}
function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const normalized = value
        .map((item) => asString(item))
        .filter((item) => item.length > 0);
    return [...new Set(normalized)];
}
function parseSafetyClass(value) {
    const normalized = asString(value).toLowerCase();
    if (normalized === "read" || normalized === "write_draft" || normalized === "write_publish") {
        return normalized;
    }
    throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "safety_class must be one of read, write_draft, write_publish");
}
function toOptionalPositiveInt(value) {
    if (value === null || value === undefined || value === "") {
        return undefined;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "Caps values must be positive integers");
    }
    return parsed;
}
function toOptionalPositiveFloat(value) {
    if (value === null || value === undefined || value === "") {
        return undefined;
    }
    const parsed = Number.parseFloat(String(value));
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "max_cost_usd must be a positive number");
    }
    return parsed;
}
function normalizeCaps(value) {
    const record = asRecord(value) ?? {};
    return {
        maxPages: toOptionalPositiveInt(record.max_pages),
        maxToolCalls: toOptionalPositiveInt(record.max_tool_calls),
        maxSteps: toOptionalPositiveInt(record.max_steps),
        maxCostUsd: toOptionalPositiveFloat(record.max_cost_usd),
    };
}
function normalizeJsonSchema(value) {
    const record = asRecord(value);
    if (!record) {
        return { type: "object", properties: {} };
    }
    return record;
}
function normalizeSkillSpec(raw, source) {
    const payload = asRecord(raw);
    if (!payload) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "Skill spec must be a JSON object");
    }
    const skillId = asString(payload.skill_id);
    if (!skillId) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "skill_id is required");
    }
    const version = asString(payload.version);
    if (!version) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "version is required");
    }
    const name = asString(payload.name || skillId);
    const description = asString(payload.description);
    if (!description) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "description is required");
    }
    const toolAllowlist = asStringArray(payload.tool_allowlist);
    if (toolAllowlist.length === 0) {
        throw new SkillNormalizationError("SKILL_SCHEMA_INVALID", "tool_allowlist must contain at least one tool");
    }
    return {
        skillId,
        version,
        sourceRepo: source.repoUrl,
        sourceCommitSha: source.commitSha,
        sourcePath: source.path,
        name,
        description,
        tags: asStringArray(payload.tags).map((tag) => tag.toLowerCase()),
        inputsSchema: normalizeJsonSchema(payload.inputs_schema),
        outputsSchema: normalizeJsonSchema(payload.outputs_schema),
        toolAllowlist,
        caps: normalizeCaps(payload.caps),
        safetyClass: parseSafetyClass(payload.safety_class),
        deprecated: Boolean(payload.deprecated),
    };
}
