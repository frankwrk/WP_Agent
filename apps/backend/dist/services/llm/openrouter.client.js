"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterClient = void 0;
const config_1 = require("../../config");
class OpenRouterClient {
    apiKey;
    baseUrl;
    constructor(apiKey = (0, config_1.getConfig)().openrouterApiKey, baseUrl = (0, config_1.getConfig)().openrouterBaseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async completeChat(request) {
        if (!this.apiKey) {
            throw new Error("OPENROUTER_API_KEY is required for chat runtime");
        }
        const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                max_tokens: request.maxTokens,
            }),
        });
        const payload = (await response.json());
        if (!response.ok) {
            throw new Error(payload.error?.message ?? `LLM request failed with status ${response.status}`);
        }
        const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
        if (!content) {
            throw new Error("LLM returned an empty response");
        }
        return {
            content,
            model: payload.model ?? request.model,
            usageTokens: payload.usage?.total_tokens ?? Math.max(1, Math.ceil(content.length / 4)),
        };
    }
}
exports.OpenRouterClient = OpenRouterClient;
