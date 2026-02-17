"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimatePlan = estimatePlan;
function safetyWeight(safetyClass) {
    if (safetyClass === "write_publish") {
        return 2;
    }
    if (safetyClass === "write_draft") {
        return 1;
    }
    return 0;
}
function costBand(costUsd) {
    if (costUsd < 0.5) {
        return "low";
    }
    if (costUsd < 2) {
        return "medium";
    }
    return "high";
}
function tokenBucket(tokens) {
    if (tokens < 4000) {
        return "low";
    }
    if (tokens < 12000) {
        return "medium";
    }
    return "high";
}
function confidenceBand(steps) {
    const withStepEstimates = steps.filter((step) => step.pageCountEstimate > 0 || step.toolCallEstimate > 0).length;
    if (withStepEstimates === steps.length) {
        return "high";
    }
    if (withStepEstimates >= Math.ceil(steps.length / 2)) {
        return "medium";
    }
    return "low";
}
function estimatePlan(options) {
    const estimatedToolCalls = {};
    let estimatedPages = 0;
    let weightedCalls = 0;
    let maxSafetyWeight = 0;
    for (const step of options.steps) {
        estimatedPages += step.pageCountEstimate;
        let stepCalls = Math.max(step.toolCallEstimate, step.tools.length);
        for (const toolName of step.tools) {
            estimatedToolCalls[toolName] = (estimatedToolCalls[toolName] ?? 0) + 1;
            stepCalls -= 1;
            const tool = options.toolRegistry[toolName];
            if (tool) {
                weightedCalls += tool.costWeight;
                maxSafetyWeight = Math.max(maxSafetyWeight, safetyWeight(tool.safetyClass));
            }
        }
        if (stepCalls > 0 && step.tools[0]) {
            estimatedToolCalls[step.tools[0]] += stepCalls;
            const firstTool = options.toolRegistry[step.tools[0]];
            if (firstTool) {
                weightedCalls += stepCalls * firstTool.costWeight;
            }
        }
    }
    const totalToolCalls = Object.values(estimatedToolCalls).reduce((sum, value) => sum + value, 0);
    const estimatedTokens = Math.round(1200 + options.steps.length * 220 + weightedCalls * 320 + estimatedPages * 85);
    const estimatedCostUsd = Number.parseFloat(((estimatedTokens / 1000) * 0.002).toFixed(4));
    const estimate = {
        estimatedPages,
        estimatedToolCalls,
        estimatedTokensBucket: tokenBucket(estimatedTokens),
        estimatedCostUsdBand: costBand(estimatedCostUsd),
        estimatedRuntimeSec: Math.max(20, options.steps.length * 8 + totalToolCalls * 4),
        confidenceBand: confidenceBand(options.steps),
        estimatedCostUsd,
    };
    const writeIntensity = maxSafetyWeight / 2;
    const costRatioToCap = options.maxCostUsd > 0 ? estimatedCostUsd / options.maxCostUsd : 0;
    const score = Math.round(20
        + Math.min(35, options.steps.length * 4)
        + Math.round(writeIntensity * 30)
        + Math.min(15, Object.keys(estimatedToolCalls).length * 3)
        + Math.min(25, Math.max(0, costRatioToCap) * 25));
    const risk = {
        tier: maxSafetyWeight === 0 ? "LOW" : maxSafetyWeight === 1 ? "MEDIUM" : "HIGH",
        score: Math.min(100, score),
        factors: {
            numberOfSteps: options.steps.length,
            writeIntensity,
            toolNovelty: Math.min(1, Object.keys(estimatedToolCalls).length / 5),
            costRatioToCap,
        },
    };
    const gatingIssues = [];
    if (estimatedCostUsd > options.maxCostUsd) {
        gatingIssues.push({
            code: "PLAN_COST_CAP_EXCEEDED",
            message: `Estimated plan cost ${estimatedCostUsd.toFixed(2)} exceeds cap ${options.maxCostUsd.toFixed(2)}`,
        });
    }
    return {
        estimate,
        risk,
        gatingIssues,
    };
}
