"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_TASK_CLASSES = exports.MODEL_PREFERENCES = void 0;
exports.toUniqueModelList = toUniqueModelList;
exports.parseModelPreference = parseModelPreference;
exports.preferenceFromPolicyPreset = preferenceFromPolicyPreset;
exports.taskClassFromPolicyPreset = taskClassFromPolicyPreset;
exports.resolveModelPreference = resolveModelPreference;
exports.resolveModelCandidates = resolveModelCandidates;
exports.selectModel = selectModel;
exports.MODEL_PREFERENCES = ["cheap", "balanced", "quality"];
exports.MODEL_TASK_CLASSES = [
    "chat_fast",
    "chat_balanced",
    "chat_quality",
    "planning",
    "code",
    "summarize",
    "extract_json",
];
const DEFAULT_TASK_MODELS = {
    chat_fast: {
        cheap: [
            "google/gemini-2.5-flash-lite",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        balanced: [
            "google/gemini-3-flash",
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
        ],
        quality: [
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
            "together/kat-coder-pro-v1",
        ],
    },
    chat_balanced: {
        cheap: [
            "google/gemini-2.5-flash-lite",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        balanced: [
            "google/gemini-3-flash",
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
        ],
        quality: [
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
            "together/kat-coder-pro-v1",
        ],
    },
    chat_quality: {
        cheap: [
            "google/gemini-2.5-flash-lite",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        balanced: [
            "google/gemini-3-flash",
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
        ],
        quality: [
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
            "together/kat-coder-pro-v1",
        ],
    },
    planning: {
        cheap: [
            "google/gemini-2.5-flash-lite",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        balanced: [
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
            "google/gemini-3-flash",
        ],
        quality: [
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
        ],
    },
    code: {
        cheap: [
            "deepseek/deepseek-v3.2",
            "google/gemini-2.5-flash-lite",
            "anthropic/claude-haiku-4.5",
        ],
        balanced: [
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
        ],
        quality: [
            "together/kat-coder-pro-v1",
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
        ],
    },
    summarize: {
        cheap: [
            "google/gemini-2.5-flash-lite",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        balanced: [
            "google/gemini-3-flash",
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
        ],
        quality: [
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
        ],
    },
    extract_json: {
        cheap: [
            "google/gemini-2.5-flash-lite",
            "deepseek/deepseek-v3.2",
            "anthropic/claude-haiku-4.5",
        ],
        balanced: [
            "google/gemini-3-flash",
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
        ],
        quality: [
            "anthropic/claude-opus-4.6",
            "openai/gpt-5.2",
            "moonshot/kimi-k2.5",
        ],
    },
};
function toUniqueModelList(list) {
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        const model = String(raw).trim();
        if (!model || seen.has(model)) {
            continue;
        }
        seen.add(model);
        out.push(model);
    }
    return out;
}
function parseModelList(value) {
    if (!value) {
        return [];
    }
    return toUniqueModelList(value.split(","));
}
function parseModelPreference(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "cheap" || normalized === "balanced" || normalized === "quality") {
        return normalized;
    }
    return null;
}
function preferenceFromPolicyPreset(policyPreset) {
    switch (policyPreset) {
        case "fast":
            return "cheap";
        case "balanced":
            return "balanced";
        case "quality":
        case "reasoning":
            return "quality";
        default:
            return "balanced";
    }
}
function taskClassFromPolicyPreset(policyPreset) {
    switch (policyPreset) {
        case "fast":
            return "chat_fast";
        case "quality":
        case "reasoning":
            return "chat_quality";
        case "balanced":
        default:
            return "chat_balanced";
    }
}
function resolveModelPreference(options) {
    if (options.explicitPreference) {
        return options.explicitPreference;
    }
    const envPreference = parseModelPreference(process.env.MODEL_DEFAULT_PREFERENCE);
    if (envPreference) {
        return envPreference;
    }
    return options.routeDefaultPreference ?? "balanced";
}
function taskPreferenceEnvKey(taskClass, preference) {
    return `MODEL_${taskClass.toUpperCase()}_${preference.toUpperCase()}`;
}
function resolveModelCandidates(options) {
    const envCandidates = parseModelList(process.env[taskPreferenceEnvKey(options.taskClass, options.preference)]);
    const fallbackCandidates = DEFAULT_TASK_MODELS[options.taskClass][options.preference];
    return toUniqueModelList([
        ...(options.additionalCandidates ?? []),
        ...envCandidates,
        ...fallbackCandidates,
    ]);
}
function selectModel(options) {
    const candidates = resolveModelCandidates(options);
    return candidates[0] ?? "google/gemini-3-flash";
}
