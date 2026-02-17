"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanParseError = void 0;
exports.parseSinglePlanJsonBlock = parseSinglePlanJsonBlock;
class PlanParseError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "PlanParseError";
    }
}
exports.PlanParseError = PlanParseError;
function parseJsonObject(value) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new PlanParseError("PLAN_PARSE_NONJSON", "Plan output is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new PlanParseError("PLAN_SCHEMA_INVALID", "Plan output must be a JSON object");
    }
    return parsed;
}
function parseSinglePlanJsonBlock(rawOutput) {
    const raw = String(rawOutput ?? "").trim();
    if (!raw) {
        throw new PlanParseError("PLAN_PARSE_NONJSON", "Plan output is empty");
    }
    if (raw.startsWith("{") && raw.endsWith("}")) {
        return parseJsonObject(raw);
    }
    const fences = [...raw.matchAll(/```([a-zA-Z0-9_-]*)\s*([\s\S]*?)```/g)];
    if (fences.length === 0) {
        throw new PlanParseError("PLAN_PARSE_NONJSON", "Plan output must be either raw JSON or a single fenced json block");
    }
    if (fences.length > 1) {
        throw new PlanParseError("PLAN_PARSE_MULTIBLOCK", "Plan output contains multiple fenced blocks");
    }
    const [single] = fences;
    if (!single) {
        throw new PlanParseError("PLAN_PARSE_NONJSON", "Plan output did not include a fenced JSON block");
    }
    const language = String(single[1] ?? "").trim().toLowerCase();
    if (language !== "json") {
        throw new PlanParseError("PLAN_PARSE_NONJSON", "Fenced plan output must use ```json language tag");
    }
    const block = single[0];
    const remainder = raw.replace(block, "").trim();
    if (remainder.length > 0) {
        throw new PlanParseError("PLAN_PARSE_NONJSON", "Plan output must not include prose outside the JSON block");
    }
    const jsonBody = String(single[2] ?? "").trim();
    return parseJsonObject(jsonBody);
}
