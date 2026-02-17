"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiGatewayClient = void 0;
exports.extractProviderRequestId = extractProviderRequestId;
const ai_1 = require("ai");
const openai_compatible_1 = require("@ai-sdk/openai-compatible");
const config_1 = require("../../config");
function normalizeProviderError(error) {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    if (error
        && typeof error === "object"
        && "cause" in error
        && error.cause instanceof Error
        && error.cause.message.trim()) {
        return error.cause.message;
    }
    return "LLM request failed";
}
function headerValue(headers, key) {
    const value = headers.get(key);
    return value ? value : undefined;
}
function extractProviderRequestId(response) {
    if (!response || typeof response !== "object") {
        return undefined;
    }
    const candidate = response;
    const direct = [candidate.requestId, candidate.request_id, candidate.id]
        .map((value) => String(value ?? "").trim())
        .find((value) => value.length > 0);
    if (direct) {
        return direct;
    }
    const possibleHeaders = [candidate.headers, candidate.response?.headers];
    for (const possible of possibleHeaders) {
        if (possible instanceof Headers) {
            return (headerValue(possible, "x-request-id")
                ?? headerValue(possible, "request-id")
                ?? headerValue(possible, "openai-request-id"));
        }
    }
    if (candidate.providerMetadata && typeof candidate.providerMetadata === "object") {
        for (const value of Object.values(candidate.providerMetadata)) {
            if (!value || typeof value !== "object") {
                continue;
            }
            const raw = value;
            const providerId = [raw.requestId, raw.request_id, raw.id]
                .map((item) => String(item ?? "").trim())
                .find((item) => item.length > 0);
            if (providerId) {
                return providerId;
            }
        }
    }
    return undefined;
}
class AiGatewayClient {
    apiKey;
    baseUrl;
    provider;
    constructor(apiKey = (0, config_1.getConfig)().aiGatewayApiKey, baseUrl = (0, config_1.getConfig)().aiGatewayBaseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.provider = (0, openai_compatible_1.createOpenAICompatible)({
            name: "vercel-ai-gateway",
            apiKey: this.apiKey,
            baseURL: this.baseUrl,
        });
    }
    async completeChat(request) {
        if (!this.apiKey) {
            throw new Error("AI_GATEWAY_API_KEY is required for chat runtime");
        }
        try {
            const result = await (0, ai_1.generateText)({
                model: this.provider(request.model),
                messages: request.messages,
                maxOutputTokens: request.maxTokens,
            });
            const content = result.text.trim();
            if (!content) {
                throw new Error("LLM returned an empty response");
            }
            const usageTokens = (result.usage.totalTokens
                ?? ((result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0))) || Math.max(1, Math.ceil(content.length / 4));
            return {
                content,
                model: result.response.modelId ?? request.model,
                usageTokens,
                requestId: request.requestId,
                providerRequestId: extractProviderRequestId(result.response),
            };
        }
        catch (error) {
            throw new Error(normalizeProviderError(error));
        }
    }
}
exports.AiGatewayClient = AiGatewayClient;
