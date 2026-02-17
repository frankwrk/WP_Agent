"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePlanHash = computePlanHash;
exports.toApiPlan = toApiPlan;
const node_crypto_1 = require("node:crypto");
function stableSortObject(input) {
    if (Array.isArray(input)) {
        return input.map((item) => stableSortObject(item));
    }
    if (!input || typeof input !== "object") {
        return input;
    }
    const source = input;
    const sortedKeys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    const result = {};
    for (const key of sortedKeys) {
        result[key] = stableSortObject(source[key]);
    }
    return result;
}
function canonicalJsonString(input) {
    return JSON.stringify(stableSortObject(input));
}
function computePlanHash(input) {
    const canonical = canonicalJsonString(input);
    return (0, node_crypto_1.createHash)("sha256").update(canonical).digest("hex");
}
function toApiPlan(contract) {
    return {
        plan_version: contract.planVersion,
        plan_id: contract.planId,
        plan_hash: contract.planHash,
        skill_id: contract.skillId,
        goal: contract.goal,
        assumptions: contract.assumptions,
        inputs: contract.inputs,
        steps: contract.steps.map((step) => ({
            step_id: step.stepId,
            title: step.title,
            objective: step.objective,
            tools: step.tools,
            expected_output: step.expectedOutput,
            page_count_estimate: step.pageCountEstimate,
            tool_call_estimate: step.toolCallEstimate,
        })),
        estimates: {
            estimated_pages: contract.estimates.estimatedPages,
            estimated_tool_calls: contract.estimates.estimatedToolCalls,
            estimated_tokens_bucket: contract.estimates.estimatedTokensBucket,
            estimated_cost_usd_band: contract.estimates.estimatedCostUsdBand,
            estimated_runtime_sec: contract.estimates.estimatedRuntimeSec,
            confidence_band: contract.estimates.confidenceBand,
            estimated_cost_usd: contract.estimates.estimatedCostUsd,
        },
        risk: {
            tier: contract.risk.tier,
            score: contract.risk.score,
            factors: {
                number_of_steps: contract.risk.factors.numberOfSteps,
                write_intensity: contract.risk.factors.writeIntensity,
                tool_novelty: contract.risk.factors.toolNovelty,
                cost_ratio_to_cap: contract.risk.factors.costRatioToCap,
            },
        },
        validation_issues: contract.validationIssues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            step_id: issue.stepId,
        })),
        policy_context: {
            policy_preset: contract.policyContext.policyPreset,
            model: contract.policyContext.model,
            max_steps: contract.policyContext.maxSteps,
            max_tool_calls: contract.policyContext.maxToolCalls,
            max_pages: contract.policyContext.maxPages,
            max_cost_usd: contract.policyContext.maxCostUsd,
        },
        status: contract.status,
        llm_usage_tokens: contract.llmUsageTokens,
        llm_model: contract.llmModel,
        created_at: contract.createdAt,
        updated_at: contract.updatedAt,
    };
}
