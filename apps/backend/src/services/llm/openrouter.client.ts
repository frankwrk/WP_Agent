import { getConfig } from "../../config";

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  maxTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usageTokens: number;
}

export interface LlmClient {
  completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

export class OpenRouterClient implements LlmClient {
  constructor(
    private readonly apiKey = getConfig().openrouterApiKey,
    private readonly baseUrl = getConfig().openrouterBaseUrl,
  ) {}

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
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

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
      error?: { message?: string };
    };

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
