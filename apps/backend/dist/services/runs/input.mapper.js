"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunInputError = void 0;
exports.mapRunExecutionInput = mapRunExecutionInput;
class RunInputError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "RunInputError";
    }
}
exports.RunInputError = RunInputError;
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asTrimmedString(value) {
    return String(value ?? "").trim();
}
function parsePages(raw) {
    if (!Array.isArray(raw)) {
        throw new RunInputError("RUN_INVALID_INPUT", "plan inputs must include pages[] with at least one page payload");
    }
    const pages = [];
    for (let index = 0; index < raw.length; index += 1) {
        const item = asRecord(raw[index]);
        if (!item) {
            throw new RunInputError("RUN_INVALID_INPUT", `pages[${index}] must be an object`);
        }
        const title = asTrimmedString(item.title);
        if (!title) {
            throw new RunInputError("RUN_INVALID_INPUT", `pages[${index}].title is required`);
        }
        const slug = asTrimmedString(item.slug);
        const content = String(item.content ?? "");
        const excerpt = asTrimmedString(item.excerpt);
        const meta = item.meta === undefined ? undefined : asRecord(item.meta);
        if (item.meta !== undefined && !meta) {
            throw new RunInputError("RUN_INVALID_INPUT", `pages[${index}].meta must be an object`);
        }
        pages.push({
            title,
            slug: slug || undefined,
            content,
            excerpt: excerpt || undefined,
            meta: meta ?? undefined,
        });
    }
    if (pages.length === 0) {
        throw new RunInputError("RUN_INVALID_INPUT", "pages[] must include at least one item");
    }
    return pages;
}
function resolveStepId(plan) {
    const preferred = plan.steps.find((step) => step.tools.includes("content.bulk_create") || step.tools.includes("content.create_page"));
    const fallback = preferred ?? plan.steps[0];
    if (!fallback || !fallback.stepId) {
        throw new RunInputError("RUN_INVALID_INPUT", "plan steps are missing a usable step_id");
    }
    return fallback.stepId;
}
function mapRunExecutionInput(options) {
    const planInputs = asRecord(options.plan.inputs);
    if (!planInputs) {
        throw new RunInputError("RUN_INVALID_INPUT", "plan inputs must be an object");
    }
    const pages = parsePages(planInputs.pages);
    const plannedSteps = options.plan.steps.length;
    const effectiveCaps = {
        maxSteps: Math.min(options.envCaps.maxSteps, options.plan.policyContext.maxSteps, options.skill.caps.maxSteps ?? Number.MAX_SAFE_INTEGER),
        maxToolCalls: Math.min(options.envCaps.maxToolCalls, options.plan.policyContext.maxToolCalls, options.skill.caps.maxToolCalls ?? Number.MAX_SAFE_INTEGER),
        maxPages: Math.min(options.envCaps.maxPages, options.plan.policyContext.maxPages, options.skill.caps.maxPages ?? Number.MAX_SAFE_INTEGER),
    };
    if (plannedSteps > effectiveCaps.maxSteps) {
        throw new RunInputError("RUN_STEP_CAP_EXCEEDED", `Plan has ${plannedSteps} steps, exceeds effective max_steps ${effectiveCaps.maxSteps}`);
    }
    if (pages.length > effectiveCaps.maxPages) {
        throw new RunInputError("RUN_PAGE_CAP_EXCEEDED", `Execution has ${pages.length} pages, exceeds effective max_pages ${effectiveCaps.maxPages}`);
    }
    const mode = pages.length === 1 ? "single" : "bulk";
    if (mode === "bulk" && pages.length > options.maxPagesPerBulk) {
        throw new RunInputError("RUN_PAGE_CAP_EXCEEDED", `Bulk execution pages ${pages.length} exceeds per-request cap ${options.maxPagesPerBulk}`);
    }
    const plannedToolCalls = 1;
    if (plannedToolCalls > effectiveCaps.maxToolCalls) {
        throw new RunInputError("RUN_TOOL_CALL_CAP_EXCEEDED", `Planned tool calls ${plannedToolCalls} exceed effective max_tool_calls ${effectiveCaps.maxToolCalls}`);
    }
    return {
        pages,
        mode,
        stepId: resolveStepId(options.plan),
        plannedSteps,
        plannedToolCalls,
        plannedPages: pages.length,
        effectiveCaps,
    };
}
