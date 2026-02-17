"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectModelForPolicy = selectModelForPolicy;
const models_1 = require("./models");
function selectModelForPolicy(options) {
    const policyPreset = options.policyPreset ?? options.policy.preset;
    const taskClass = options.taskClass ?? (0, models_1.taskClassFromPolicyPreset)(policyPreset);
    const routeDefaultPreference = options.routeDefaultPreference ?? (0, models_1.preferenceFromPolicyPreset)(policyPreset);
    const preference = (0, models_1.resolveModelPreference)({
        explicitPreference: options.explicitPreference,
        routeDefaultPreference,
    });
    const candidates = (0, models_1.resolveModelCandidates)({
        taskClass,
        preference,
        additionalCandidates: [
            ...(options.additionalCandidates ?? []),
            options.policy.model,
        ],
    });
    const model = candidates[0] ?? "google/gemini-3-flash";
    const routingReason = `policy:${policyPreset} task:${taskClass} pref:${preference} candidates:[${candidates.join(",")}] => ${model}`;
    return {
        model,
        preference,
        taskClass,
        candidates,
        routingReason,
    };
}
